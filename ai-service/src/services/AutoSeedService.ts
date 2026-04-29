import type { FastifyBaseLogger } from 'fastify'
import type { Pool } from 'pg'
import type { Driver } from 'neo4j-driver'
import { isAlreadySeeded, runSeed } from '../seed/seed.js'

type AutoSeedLogger = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>

export interface AutoSeedServiceOptions {
  enabled: boolean
  poolFactory: () => Pool
  driverFactory: () => Driver
  logger: AutoSeedLogger
}

/**
 * Boots the catalog before the recommender warms up.
 *
 * Strategy: on every ai-service boot, check if PG and Neo4j already hold product data.
 * If yes → no-op (warm restart with persisted volumes). If no → run the existing seed
 * routine end-to-end (cold start with empty volumes).
 *
 * The seeder itself is idempotent (ON CONFLICT DO NOTHING in PG, MERGE in Neo4j), so
 * re-running it would be safe but expensive; the prior probe lets us skip cleanly.
 *
 * Connection ownership: this service builds its own short-lived Pool and Driver via
 * the injected factories so we don't share Fastify's long-lived Neo4j driver with the
 * seed (which intentionally bypasses the domain layer per ADR-001). They are closed
 * before runIfNeeded() resolves, win or lose.
 */
export class AutoSeedService {
  private readonly enabled: boolean
  private readonly poolFactory: () => Pool
  private readonly driverFactory: () => Driver
  private readonly logger: AutoSeedLogger

  constructor(options: AutoSeedServiceOptions) {
    this.enabled = options.enabled
    this.poolFactory = options.poolFactory
    this.driverFactory = options.driverFactory
    this.logger = options.logger
  }

  async runIfNeeded(): Promise<void> {
    if (!this.enabled) {
      this.logger.info('[AutoSeed] Disabled by AUTO_SEED_ON_BOOT=false')
      return
    }

    const pool = this.poolFactory()
    const driver = this.driverFactory()

    try {
      const seeded = await isAlreadySeeded(pool, driver)
      if (seeded) {
        this.logger.info('[AutoSeed] Skipping — data already present')
        return
      }

      this.logger.info('[AutoSeed] Seeding (cold start detected)...')
      await runSeed({
        pool,
        driver,
        logger: {
          info: (msg) => this.logger.info(msg),
          warn: (msg) => this.logger.warn(msg),
          error: (msg) => this.logger.error(msg),
        },
      })
      this.logger.info('[AutoSeed] Complete')
    } catch (err) {
      // Surface the failure: the boot must not silently continue with empty databases.
      // The recommender would then sit blocked on /ready and the user would see no obvious cause.
      this.logger.error(`[AutoSeed] Failed: ${(err as Error).message}`)
      throw err
    } finally {
      // End the dedicated pool/driver regardless of outcome. The runtime services that
      // talk to PG/Neo4j during request handling use their own connections (see index.ts).
      await pool.end().catch((err) => {
        this.logger.warn(`[AutoSeed] pool.end() error (ignored): ${(err as Error).message}`)
      })
      await driver.close().catch((err) => {
        this.logger.warn(`[AutoSeed] driver.close() error (ignored): ${(err as Error).message}`)
      })
    }
  }
}

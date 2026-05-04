/**
 * CLI: offline comparison of neural architectures (no model save, no HTTP server).
 *
 * Requires: API_SERVICE_URL, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
 *
 * Usage:
 *   npm run benchmark:neural-arch -- --out ./.benchmarks/nn-arch.json
 *   npm run benchmark:neural-arch -- --profiles baseline,deep64_32
 */
import neo4j from 'neo4j-driver'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { ENV } from '../config/env.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { runNeuralArchBenchmark } from '../benchmark/neuralArchBenchmark.js'
import type { NeuralArchProfile } from '../ml/neuralModelFactory.js'
import type { ProfilePoolingMode } from '../profile/clientProfileAggregation.js'

function parsePoolingModes(arg: string | undefined): ProfilePoolingMode[] | undefined {
  if (arg == null || arg === '') return undefined
  const allowed: ProfilePoolingMode[] = ['mean', 'exp', 'attention_light', 'attention_learned']
  const list = arg.split(',').map((s) => s.trim()) as ProfilePoolingMode[]
  for (const mode of list) {
    if (!allowed.includes(mode)) {
      throw new Error(`Invalid pooling mode "${mode}". Use: ${allowed.join(', ')}`)
    }
  }
  return list
}

function parseProfiles(arg: string | undefined): NeuralArchProfile[] | undefined {
  if (arg == null || arg === '') return undefined
  const allowed: NeuralArchProfile[] = ['baseline', 'deep64_32', 'deep128_64', 'deep128_64_32', 'deep256', 'deep512']
  const list = arg.split(',').map((s) => s.trim()) as NeuralArchProfile[]
  for (const p of list) {
    if (!allowed.includes(p)) {
      throw new Error(`Invalid profile "${p}". Use: ${allowed.join(', ')}`)
    }
  }
  return list
}

function parseArgs(argv: string[]): {
  out?: string
  profiles?: NeuralArchProfile[]
  poolingModes?: ProfilePoolingMode[]
  valFraction?: number
} {
  let out: string | undefined
  let profiles: NeuralArchProfile[] | undefined
  let poolingModes: ProfilePoolingMode[] | undefined
  let valFraction: number | undefined
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out' && argv[i + 1]) {
      out = argv[++i]
    } else if (a === '--profiles' && argv[i + 1]) {
      profiles = parseProfiles(argv[++i])
    } else if (a === '--pooling-modes' && argv[i + 1]) {
      poolingModes = parsePoolingModes(argv[++i])
    } else if (a === '--val-fraction' && argv[i + 1]) {
      valFraction = parseFloat(argv[++i]!)
      if (!Number.isFinite(valFraction) || valFraction <= 0 || valFraction >= 1) {
        throw new Error('--val-fraction must be in (0,1)')
      }
    }
  }
  return { out, profiles, poolingModes, valFraction }
}

async function main(): Promise<void> {
  const { out, profiles, poolingModes, valFraction } = parseArgs(process.argv)
  const apiUrl = ENV.API_SERVICE_URL
  if (!apiUrl) {
    console.error('API_SERVICE_URL is not set. Export it to point at the API service.')
    process.exit(1)
  }
  if (!ENV.NEO4J_URI || !ENV.NEO4J_USER || !ENV.NEO4J_PASSWORD) {
    console.error('Neo4j env vars (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD) are required.')
    process.exit(1)
  }

  const driver = neo4j.driver(ENV.NEO4J_URI, neo4j.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD))
  const repo = new Neo4jRepository(driver)

  try {
    console.info('[neural-arch-benchmark] Starting run…')
    const report = await runNeuralArchBenchmark({
      apiServiceUrl: apiUrl,
      neo4jRepo: repo,
      profiles,
      poolingModes,
      valFraction,
    })
    const json = JSON.stringify(report, null, 2)
    console.info(json)
    if (out) {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, json, 'utf8')
      console.info(`[neural-arch-benchmark] Wrote ${out}`)
    }
  } finally {
    await driver.close()
  }
}

main().catch((err) => {
  console.error('[neural-arch-benchmark] Failed:', err)
  process.exit(1)
})

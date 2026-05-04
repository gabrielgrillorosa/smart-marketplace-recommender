/**
 * CLI: offline benchmark for M22 scenarios A / A+B / A+B+C.
 *
 * Requires: API_SERVICE_URL, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
 *
 * Usage:
 *   npm run benchmark:m22 -- --out ./.benchmarks/m22-arch.json
 *   npm run benchmark:m22 -- --scenarios ab,abc --val-fraction 0.2
 */
import neo4j from 'neo4j-driver'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { ENV } from '../config/env.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { runM22ArchBenchmark } from '../benchmark/m22ArchBenchmark.js'
import type { NeuralArchProfile } from '../ml/neuralModelFactory.js'
import type { ProfilePoolingMode } from '../profile/clientProfileAggregation.js'

type M22BenchmarkScenario = 'a' | 'ab' | 'abc'
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

function parseScenarios(arg: string | undefined): M22BenchmarkScenario[] | undefined {
  if (arg == null || arg === '') return undefined
  const allowed: M22BenchmarkScenario[] = ['a', 'ab', 'abc']
  const list = arg.split(',').map((s) => s.trim()) as M22BenchmarkScenario[]
  for (const s of list) {
    if (!allowed.includes(s)) {
      throw new Error(`Invalid scenario "${s}". Use: ${allowed.join(', ')}`)
    }
  }
  return list
}

function parseArgs(argv: string[]): {
  out?: string
  scenarios?: M22BenchmarkScenario[]
  profiles?: NeuralArchProfile[]
  poolingModes?: ProfilePoolingMode[]
  valFraction?: number
} {
  let out: string | undefined
  let scenarios: M22BenchmarkScenario[] | undefined
  let profiles: NeuralArchProfile[] | undefined
  let poolingModes: ProfilePoolingMode[] | undefined
  let valFraction: number | undefined
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out' && argv[i + 1]) {
      out = argv[++i]
    } else if (a === '--scenarios' && argv[i + 1]) {
      scenarios = parseScenarios(argv[++i])
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
  return { out, scenarios, profiles, poolingModes, valFraction }
}

async function main(): Promise<void> {
  const { out, scenarios, profiles, poolingModes, valFraction } = parseArgs(process.argv)
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
    console.info('[m22-arch-benchmark] Starting run…')
    const report = await runM22ArchBenchmark({
      apiServiceUrl: apiUrl,
      neo4jRepo: repo,
      scenarios,
      profiles,
      poolingModes,
      valFraction,
    })
    const json = JSON.stringify(report, null, 2)
    console.info(json)
    if (out) {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, json, 'utf8')
      console.info(`[m22-arch-benchmark] Wrote ${out}`)
    }
  } finally {
    await driver.close()
  }
}

main().catch((err) => {
  console.error('[m22-arch-benchmark] Failed:', err)
  process.exit(1)
})

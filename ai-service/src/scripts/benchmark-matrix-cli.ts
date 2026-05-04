import neo4j from 'neo4j-driver'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { ENV } from '../config/env.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { runNeuralArchBenchmark } from '../benchmark/neuralArchBenchmark.js'
import { runM22ArchBenchmark } from '../benchmark/m22ArchBenchmark.js'
import type { NeuralArchProfile } from '../ml/neuralModelFactory.js'
import type { ProfilePoolingMode } from '../profile/clientProfileAggregation.js'

type M22BenchmarkScenario = 'a' | 'ab' | 'abc'

const ALL_PROFILES: NeuralArchProfile[] = [
  'baseline',
  'deep64_32',
  'deep128_64',
  'deep128_64_32',
  'deep256',
  'deep512',
]
const ALL_POOLING: ProfilePoolingMode[] = ['mean', 'exp', 'attention_light', 'attention_learned']
const ALL_SCENARIOS: M22BenchmarkScenario[] = ['a', 'ab', 'abc']

function parseProfiles(arg: string | undefined): NeuralArchProfile[] {
  if (!arg) return ALL_PROFILES
  const list = arg.split(',').map((s) => s.trim()) as NeuralArchProfile[]
  return list
}
function parsePooling(arg: string | undefined): ProfilePoolingMode[] {
  if (!arg) return ALL_POOLING
  const list = arg.split(',').map((s) => s.trim()) as ProfilePoolingMode[]
  return list
}
function parseScenarios(arg: string | undefined): M22BenchmarkScenario[] {
  if (!arg) return ALL_SCENARIOS
  const list = arg.split(',').map((s) => s.trim()) as M22BenchmarkScenario[]
  return list
}

function parseArgs(argv: string[]): {
  out?: string
  profiles: NeuralArchProfile[]
  poolingModes: ProfilePoolingMode[]
  scenarios: M22BenchmarkScenario[]
  valFraction?: number
} {
  let out: string | undefined
  let profiles = ALL_PROFILES
  let poolingModes = ALL_POOLING
  let scenarios = ALL_SCENARIOS
  let valFraction: number | undefined
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out' && argv[i + 1]) out = argv[++i]
    else if (a === '--profiles' && argv[i + 1]) profiles = parseProfiles(argv[++i])
    else if (a === '--pooling-modes' && argv[i + 1]) poolingModes = parsePooling(argv[++i])
    else if (a === '--scenarios' && argv[i + 1]) scenarios = parseScenarios(argv[++i])
    else if (a === '--val-fraction' && argv[i + 1]) {
      valFraction = parseFloat(argv[++i]!)
      if (!Number.isFinite(valFraction) || valFraction <= 0 || valFraction >= 1) {
        throw new Error('--val-fraction must be in (0,1)')
      }
    }
  }
  return { out, profiles, poolingModes, scenarios, valFraction }
}

async function main(): Promise<void> {
  const { out, profiles, poolingModes, scenarios, valFraction } = parseArgs(process.argv)
  const apiUrl = ENV.API_SERVICE_URL
  if (!apiUrl) throw new Error('API_SERVICE_URL is not set.')
  if (!ENV.NEO4J_URI || !ENV.NEO4J_USER || !ENV.NEO4J_PASSWORD) {
    throw new Error('Neo4j env vars (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD) are required.')
  }

  const driver = neo4j.driver(ENV.NEO4J_URI, neo4j.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD))
  const repo = new Neo4jRepository(driver)
  try {
    console.info('[benchmark:matrix] Running baseline grid…')
    const baseline = await runNeuralArchBenchmark({
      apiServiceUrl: apiUrl,
      neo4jRepo: repo,
      profiles,
      poolingModes,
      valFraction,
    })
    console.info('[benchmark:matrix] Running M22 grid…')
    const m22 = await runM22ArchBenchmark({
      apiServiceUrl: apiUrl,
      neo4jRepo: repo,
      scenarios,
      profiles,
      poolingModes,
      valFraction,
    })
    const report = {
      generatedAt: new Date().toISOString(),
      baseline,
      m22,
    }
    const json = JSON.stringify(report, null, 2)
    console.info(json)
    if (out) {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, json, 'utf8')
      console.info(`[benchmark:matrix] Wrote ${out}`)
    }
  } finally {
    await driver.close()
  }
}

main().catch((err) => {
  console.error('[benchmark:matrix] Failed:', err)
  process.exit(1)
})

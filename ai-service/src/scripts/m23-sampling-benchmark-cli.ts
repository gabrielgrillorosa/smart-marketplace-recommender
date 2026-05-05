/**
 * CLI: offline benchmark for M23 negative sampling (`legacy` vs `stratified`).
 *
 * Requires: API_SERVICE_URL, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
 *
 * Usage:
 *   npm run benchmark:m23 -- --out ./.benchmarks/m23-sampling.json
 *   npm run benchmark:m23 -- --runs-per-config 3 --scenarios noIdentity,withIdentity
 *   npm run benchmark:m23 -- --profiles deep128_64,deep128_64_32,deep256 \
 *     --pooling-modes attention_light,attention_learned \
 *     --loss-modes bce,pairwise \
 *     --sampling-modes legacy,stratified
 */
import neo4j from 'neo4j-driver'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { ENV } from '../config/env.js'
import type { NegativeSamplingMode } from '../config/negativeSamplingEnv.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import {
  ALL_M23_SCENARIOS,
  runM23SamplingBenchmark,
  type M23BenchmarkScenarioId,
} from '../benchmark/m23SamplingBenchmark.js'
import type { NeuralArchProfile } from '../ml/neuralModelFactory.js'
import type { ProfilePoolingMode } from '../profile/clientProfileAggregation.js'
import type { NeuralLossMode } from '../types/index.js'

const ALL_PROFILES: NeuralArchProfile[] = [
  'baseline',
  'deep64_32',
  'deep128_64',
  'deep128_64_32',
  'deep256',
  'deep512',
]
const ALL_SAMPLING_MODES: NegativeSamplingMode[] = ['legacy', 'stratified']
const ALL_POOLING_MODES: ProfilePoolingMode[] = ['mean', 'exp', 'attention_light', 'attention_learned']
const ALL_LOSS_MODES: NeuralLossMode[] = ['bce', 'pairwise']

function parseProfiles(arg: string | undefined): NeuralArchProfile[] | undefined {
  if (arg == null || arg === '') return undefined
  const list = arg.split(',').map((s) => s.trim()) as NeuralArchProfile[]
  for (const profile of list) {
    if (!ALL_PROFILES.includes(profile)) {
      throw new Error(`Invalid profile "${profile}". Use: ${ALL_PROFILES.join(', ')}`)
    }
  }
  return list
}

function parseSamplingModes(arg: string | undefined): NegativeSamplingMode[] | undefined {
  if (arg == null || arg === '') return undefined
  const list = arg.split(',').map((s) => s.trim()) as NegativeSamplingMode[]
  for (const mode of list) {
    if (!ALL_SAMPLING_MODES.includes(mode)) {
      throw new Error(`Invalid sampling mode "${mode}". Use: ${ALL_SAMPLING_MODES.join(', ')}`)
    }
  }
  return list
}

function parsePoolingModes(arg: string | undefined): ProfilePoolingMode[] | undefined {
  if (arg == null || arg === '') return undefined
  const list = arg.split(',').map((s) => s.trim()) as ProfilePoolingMode[]
  for (const mode of list) {
    if (!ALL_POOLING_MODES.includes(mode)) {
      throw new Error(`Invalid pooling mode "${mode}". Use: ${ALL_POOLING_MODES.join(', ')}`)
    }
  }
  return list
}

function parseLossModes(arg: string | undefined): NeuralLossMode[] | undefined {
  if (arg == null || arg === '') return undefined
  const list = arg.split(',').map((s) => s.trim()) as NeuralLossMode[]
  for (const mode of list) {
    if (!ALL_LOSS_MODES.includes(mode)) {
      throw new Error(`Invalid loss mode "${mode}". Use: ${ALL_LOSS_MODES.join(', ')}`)
    }
  }
  return list
}

function parseScenarios(arg: string | undefined): M23BenchmarkScenarioId[] | undefined {
  if (arg == null || arg === '') return undefined
  const list = arg.split(',').map((s) => s.trim()) as M23BenchmarkScenarioId[]
  for (const scenario of list) {
    if (!ALL_M23_SCENARIOS.includes(scenario)) {
      throw new Error(`Invalid scenario "${scenario}". Use: ${ALL_M23_SCENARIOS.join(', ')}`)
    }
  }
  return list
}

function parseArgs(argv: string[]): {
  out?: string
  samplingModes?: NegativeSamplingMode[]
  scenarios?: M23BenchmarkScenarioId[]
  runsPerConfig?: number
  valFraction?: number
  profiles?: NeuralArchProfile[]
  poolingModes?: ProfilePoolingMode[]
  lossModes?: NeuralLossMode[]
} {
  let out: string | undefined
  let samplingModes: NegativeSamplingMode[] | undefined
  let scenarios: M23BenchmarkScenarioId[] | undefined
  let runsPerConfig: number | undefined
  let valFraction: number | undefined
  let profiles: NeuralArchProfile[] | undefined
  let poolingModes: ProfilePoolingMode[] | undefined
  let lossModes: NeuralLossMode[] | undefined

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out' && argv[i + 1]) {
      out = argv[++i]
    } else if (arg === '--sampling-modes' && argv[i + 1]) {
      samplingModes = parseSamplingModes(argv[++i])
    } else if (arg === '--scenarios' && argv[i + 1]) {
      scenarios = parseScenarios(argv[++i])
    } else if (arg === '--runs-per-config' && argv[i + 1]) {
      runsPerConfig = Number.parseInt(argv[++i]!, 10)
      if (!Number.isInteger(runsPerConfig) || runsPerConfig < 2) {
        throw new Error('--runs-per-config must be an integer >= 2')
      }
    } else if (arg === '--val-fraction' && argv[i + 1]) {
      valFraction = Number.parseFloat(argv[++i]!)
      if (!Number.isFinite(valFraction) || valFraction <= 0 || valFraction >= 1) {
        throw new Error('--val-fraction must be in (0,1)')
      }
    } else if (arg === '--profile' && argv[i + 1]) {
      profiles = parseProfiles(argv[++i])
    } else if (arg === '--profiles' && argv[i + 1]) {
      profiles = parseProfiles(argv[++i])
    } else if (arg === '--pooling-modes' && argv[i + 1]) {
      poolingModes = parsePoolingModes(argv[++i])
    } else if (arg === '--loss-modes' && argv[i + 1]) {
      lossModes = parseLossModes(argv[++i])
    }
  }

  return { out, samplingModes, scenarios, runsPerConfig, valFraction, profiles, poolingModes, lossModes }
}

async function main(): Promise<void> {
  const { out, samplingModes, scenarios, runsPerConfig, valFraction, profiles, poolingModes, lossModes } =
    parseArgs(process.argv)
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
    console.info('[m23-sampling-benchmark] Starting run...')
    const report = await runM23SamplingBenchmark({
      apiServiceUrl: apiUrl,
      neo4jRepo: repo,
      samplingModes,
      scenarios,
      runsPerConfig,
      valFraction,
      profiles,
      poolingModes,
      lossModes,
    })
    const json = JSON.stringify(report, null, 2)
    console.info(json)
    if (out) {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, json, 'utf8')
      console.info(`[m23-sampling-benchmark] Wrote ${out}`)
    }
  } finally {
    await driver.close()
  }
}

main().catch((err) => {
  console.error('[m23-sampling-benchmark] Failed:', err)
  process.exit(1)
})

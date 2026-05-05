/**
 * M23 — runtime contract for negative sampling strategy.
 *
 * Default keeps `legacy` operational behaviour (rollback safety). Threshold
 * defaults reproduce the spec's reference ranges (soft 0.92, hard min 0.70,
 * medium min 0.40). `M23_BENCHMARK_RUNS` enforces minimum of 2 runs to
 * control variance during legacy vs stratified comparisons.
 */

export type NegativeSamplingMode = 'legacy' | 'stratified'

export type NegativeSamplingEnv = {
  mode: NegativeSamplingMode
  softMaxSim: number
  hardMinSim: number
  mediumMinSim: number
  benchmarkRuns: number
}

export const NEGATIVE_SAMPLING_ENV_DEFAULTS: NegativeSamplingEnv = Object.freeze({
  mode: 'legacy',
  softMaxSim: 0.92,
  hardMinSim: 0.7,
  mediumMinSim: 0.4,
  benchmarkRuns: 2,
}) as NegativeSamplingEnv

function parseMode(raw: string | undefined): NegativeSamplingMode {
  if (raw === undefined || raw.trim() === '') return NEGATIVE_SAMPLING_ENV_DEFAULTS.mode
  const v = raw.trim().toLowerCase()
  if (v === 'legacy') return 'legacy'
  if (v === 'stratified') return 'stratified'
  console.warn(
    `[ai-service] NEGATIVE_SAMPLING_MODE="${raw}" is invalid — using default "${NEGATIVE_SAMPLING_ENV_DEFAULTS.mode}". Valid values: legacy, stratified.`
  )
  return NEGATIVE_SAMPLING_ENV_DEFAULTS.mode
}

function parseSimThreshold(raw: string | undefined, varName: string, defaultValue: number): number {
  if (raw === undefined || raw.trim() === '') return defaultValue
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    console.warn(
      `[ai-service] ${varName}="${raw}" is invalid — using default ${defaultValue}. Expected finite number in [0,1].`
    )
    return defaultValue
  }
  return n
}

function parseBenchmarkRuns(raw: string | undefined, defaultValue: number): number {
  if (raw === undefined || raw.trim() === '') return defaultValue
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 2) {
    console.warn(
      `[ai-service] M23_BENCHMARK_RUNS="${raw}" is invalid or below the minimum (2) — using default ${defaultValue}.`
    )
    return defaultValue
  }
  return n
}

export function parseNegativeSamplingEnv(env: NodeJS.ProcessEnv = process.env): NegativeSamplingEnv {
  return {
    mode: parseMode(env.NEGATIVE_SAMPLING_MODE),
    softMaxSim: parseSimThreshold(
      env.SOFT_NEGATIVE_MAX_SIM,
      'SOFT_NEGATIVE_MAX_SIM',
      NEGATIVE_SAMPLING_ENV_DEFAULTS.softMaxSim
    ),
    hardMinSim: parseSimThreshold(
      env.HARD_NEGATIVE_MIN_SIM,
      'HARD_NEGATIVE_MIN_SIM',
      NEGATIVE_SAMPLING_ENV_DEFAULTS.hardMinSim
    ),
    mediumMinSim: parseSimThreshold(
      env.MEDIUM_NEGATIVE_MIN_SIM,
      'MEDIUM_NEGATIVE_MIN_SIM',
      NEGATIVE_SAMPLING_ENV_DEFAULTS.mediumMinSim
    ),
    benchmarkRuns: parseBenchmarkRuns(
      env.M23_BENCHMARK_RUNS,
      NEGATIVE_SAMPLING_ENV_DEFAULTS.benchmarkRuns
    ),
  }
}

/**
 * Fail-fast at startup: thresholds must form a coherent ordering
 * `mediumMinSim < hardMinSim < softMaxSim` (M23-12) and benchmark runs >= 2 (M23-18 echo).
 */
export function assertNegativeSamplingEnvOrThrow(cfg: NegativeSamplingEnv): void {
  if (cfg.mediumMinSim < 0) {
    throw new Error(
      `[ai-service] Invalid M23 env: MEDIUM_NEGATIVE_MIN_SIM=${cfg.mediumMinSim} must be >= 0. Refuse to start.`
    )
  }
  if (cfg.hardMinSim <= cfg.mediumMinSim) {
    throw new Error(
      `[ai-service] Invalid M23 env: HARD_NEGATIVE_MIN_SIM=${cfg.hardMinSim} must be > MEDIUM_NEGATIVE_MIN_SIM=${cfg.mediumMinSim}. Refuse to start.`
    )
  }
  if (cfg.softMaxSim <= cfg.hardMinSim) {
    throw new Error(
      `[ai-service] Invalid M23 env: SOFT_NEGATIVE_MAX_SIM=${cfg.softMaxSim} must be > HARD_NEGATIVE_MIN_SIM=${cfg.hardMinSim}. Refuse to start.`
    )
  }
  if (cfg.benchmarkRuns < 2) {
    throw new Error(
      `[ai-service] Invalid M23 env: M23_BENCHMARK_RUNS=${cfg.benchmarkRuns} must be >= 2. Refuse to start.`
    )
  }
}

export function logNegativeSamplingEnvSummary(cfg: NegativeSamplingEnv): void {
  console.info(
    `[ai-service] M23 negative sampling: NEGATIVE_SAMPLING_MODE=${cfg.mode}, SOFT_NEGATIVE_MAX_SIM=${cfg.softMaxSim}, HARD_NEGATIVE_MIN_SIM=${cfg.hardMinSim}, MEDIUM_NEGATIVE_MIN_SIM=${cfg.mediumMinSim}, M23_BENCHMARK_RUNS=${cfg.benchmarkRuns}`
  )
}

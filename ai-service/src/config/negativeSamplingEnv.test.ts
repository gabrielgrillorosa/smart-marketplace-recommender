import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  NEGATIVE_SAMPLING_ENV_DEFAULTS,
  assertNegativeSamplingEnvOrThrow,
  parseNegativeSamplingEnv,
} from './negativeSamplingEnv.js'

describe('parseNegativeSamplingEnv', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  afterEach(() => {
    warn.mockClear()
  })

  it('returns legacy defaults when env is empty', () => {
    const cfg = parseNegativeSamplingEnv({})
    expect(cfg.mode).toBe('legacy')
    expect(cfg.softMaxSim).toBeCloseTo(0.92, 6)
    expect(cfg.hardMinSim).toBeCloseTo(0.7, 6)
    expect(cfg.mediumMinSim).toBeCloseTo(0.4, 6)
    expect(cfg.benchmarkRuns).toBe(2)
    expect(cfg).toEqual(NEGATIVE_SAMPLING_ENV_DEFAULTS)
  })

  it('accepts NEGATIVE_SAMPLING_MODE=stratified (case-insensitive, trimmed)', () => {
    expect(parseNegativeSamplingEnv({ NEGATIVE_SAMPLING_MODE: 'stratified' }).mode).toBe('stratified')
    expect(parseNegativeSamplingEnv({ NEGATIVE_SAMPLING_MODE: '  STRATIFIED ' }).mode).toBe('stratified')
    expect(parseNegativeSamplingEnv({ NEGATIVE_SAMPLING_MODE: 'Legacy' }).mode).toBe('legacy')
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns and falls back to legacy on invalid mode', () => {
    expect(parseNegativeSamplingEnv({ NEGATIVE_SAMPLING_MODE: 'hard' }).mode).toBe('legacy')
    expect(warn).toHaveBeenCalled()
  })

  it('parses numeric thresholds with overrides', () => {
    const cfg = parseNegativeSamplingEnv({
      SOFT_NEGATIVE_MAX_SIM: '0.95',
      HARD_NEGATIVE_MIN_SIM: '0.75',
      MEDIUM_NEGATIVE_MIN_SIM: '0.45',
    })
    expect(cfg.softMaxSim).toBeCloseTo(0.95, 6)
    expect(cfg.hardMinSim).toBeCloseTo(0.75, 6)
    expect(cfg.mediumMinSim).toBeCloseTo(0.45, 6)
  })

  it('warns and falls back when threshold is not a finite number in [0,1]', () => {
    const cfg = parseNegativeSamplingEnv({
      SOFT_NEGATIVE_MAX_SIM: 'not-a-number',
      HARD_NEGATIVE_MIN_SIM: '1.5',
      MEDIUM_NEGATIVE_MIN_SIM: '-0.1',
    })
    expect(cfg.softMaxSim).toBe(NEGATIVE_SAMPLING_ENV_DEFAULTS.softMaxSim)
    expect(cfg.hardMinSim).toBe(NEGATIVE_SAMPLING_ENV_DEFAULTS.hardMinSim)
    expect(cfg.mediumMinSim).toBe(NEGATIVE_SAMPLING_ENV_DEFAULTS.mediumMinSim)
    expect(warn).toHaveBeenCalled()
  })

  it('parses M23_BENCHMARK_RUNS as integer', () => {
    expect(parseNegativeSamplingEnv({ M23_BENCHMARK_RUNS: '5' }).benchmarkRuns).toBe(5)
  })

  it('clamps M23_BENCHMARK_RUNS to minimum 2 with warning', () => {
    expect(parseNegativeSamplingEnv({ M23_BENCHMARK_RUNS: '1' }).benchmarkRuns).toBe(2)
    expect(parseNegativeSamplingEnv({ M23_BENCHMARK_RUNS: '0' }).benchmarkRuns).toBe(2)
    expect(parseNegativeSamplingEnv({ M23_BENCHMARK_RUNS: '-3' }).benchmarkRuns).toBe(2)
    expect(parseNegativeSamplingEnv({ M23_BENCHMARK_RUNS: 'abc' }).benchmarkRuns).toBe(2)
    expect(warn).toHaveBeenCalled()
  })
})

describe('assertNegativeSamplingEnvOrThrow', () => {
  it('passes for default config', () => {
    expect(() => assertNegativeSamplingEnvOrThrow(NEGATIVE_SAMPLING_ENV_DEFAULTS)).not.toThrow()
  })

  it('throws when soft <= hard (soft must be strictly greater than hard)', () => {
    expect(() =>
      assertNegativeSamplingEnvOrThrow({
        mode: 'stratified',
        softMaxSim: 0.7,
        hardMinSim: 0.7,
        mediumMinSim: 0.4,
        benchmarkRuns: 2,
      })
    ).toThrow(/SOFT_NEGATIVE_MAX_SIM/)

    expect(() =>
      assertNegativeSamplingEnvOrThrow({
        mode: 'stratified',
        softMaxSim: 0.6,
        hardMinSim: 0.7,
        mediumMinSim: 0.4,
        benchmarkRuns: 2,
      })
    ).toThrow(/SOFT_NEGATIVE_MAX_SIM/)
  })

  it('throws when hard <= medium (hard must be strictly greater than medium)', () => {
    expect(() =>
      assertNegativeSamplingEnvOrThrow({
        mode: 'stratified',
        softMaxSim: 0.92,
        hardMinSim: 0.4,
        mediumMinSim: 0.4,
        benchmarkRuns: 2,
      })
    ).toThrow(/HARD_NEGATIVE_MIN_SIM/)

    expect(() =>
      assertNegativeSamplingEnvOrThrow({
        mode: 'stratified',
        softMaxSim: 0.92,
        hardMinSim: 0.3,
        mediumMinSim: 0.4,
        benchmarkRuns: 2,
      })
    ).toThrow(/HARD_NEGATIVE_MIN_SIM/)
  })

  it('throws when MEDIUM_NEGATIVE_MIN_SIM is negative', () => {
    expect(() =>
      assertNegativeSamplingEnvOrThrow({
        mode: 'stratified',
        softMaxSim: 0.92,
        hardMinSim: 0.7,
        mediumMinSim: -0.1,
        benchmarkRuns: 2,
      })
    ).toThrow(/MEDIUM_NEGATIVE_MIN_SIM/)
  })

  it('throws when benchmarkRuns < 2', () => {
    expect(() =>
      assertNegativeSamplingEnvOrThrow({
        ...NEGATIVE_SAMPLING_ENV_DEFAULTS,
        benchmarkRuns: 1,
      })
    ).toThrow(/M23_BENCHMARK_RUNS/)
  })

  it('passes for legacy mode with default thresholds', () => {
    expect(() =>
      assertNegativeSamplingEnvOrThrow({
        mode: 'legacy',
        softMaxSim: 0.92,
        hardMinSim: 0.7,
        mediumMinSim: 0.4,
        benchmarkRuns: 2,
      })
    ).not.toThrow()
  })

  it('passes for stratified mode with valid coherent ranges', () => {
    expect(() =>
      assertNegativeSamplingEnvOrThrow({
        mode: 'stratified',
        softMaxSim: 0.95,
        hardMinSim: 0.75,
        mediumMinSim: 0.45,
        benchmarkRuns: 3,
      })
    ).not.toThrow()
  })
})

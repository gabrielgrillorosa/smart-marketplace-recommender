/**
 * M22 — sparse item tower (structural B + optional identity C) feature flags.
 * Defaults reproduce pre-M22 behaviour until M22_ENABLED is explicitly set.
 */

export type M22EnvFlags = {
  enabled: boolean
  structural: boolean
  identity: boolean
}

/** Default for tests and for callers that omit M22 (master off). */
export const M22_ENV_OFF: M22EnvFlags = Object.freeze({
  enabled: false,
  structural: false,
  identity: false,
})

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === '') return defaultValue
  if (raw === 'false') return false
  if (raw === 'true') return true
  console.warn(`[ai-service] M22 boolean env invalid "${raw}" — using default ${defaultValue}`)
  return defaultValue
}

export function parseM22EnvFlags(env: NodeJS.ProcessEnv = process.env): M22EnvFlags {
  return {
    enabled: parseBool(env.M22_ENABLED, false),
    structural: parseBool(env.M22_STRUCTURAL, false),
    identity: parseBool(env.M22_IDENTITY, false),
  }
}

/**
 * Fail-fast at startup: identity (C) requires structural (B).
 * Sub-flags without master are ignored for training/inference (logged from callers).
 */
export function assertM22EnvCombinationsOrThrow(flags: M22EnvFlags): void {
  if (flags.identity && !flags.structural) {
    throw new Error(
      '[ai-service] Invalid M22 env: M22_IDENTITY=true requires M22_STRUCTURAL=true. Refuse to start.'
    )
  }
}

export function logM22EnvSummary(flags: M22EnvFlags): void {
  console.info(
    `[ai-service] M22 flags: M22_ENABLED=${flags.enabled}, M22_STRUCTURAL=${flags.structural}, M22_IDENTITY=${flags.identity}`
  )
  if ((flags.structural || flags.identity) && !flags.enabled) {
    console.warn(
      '[ai-service] M22_STRUCTURAL/M22_IDENTITY are set but M22_ENABLED=false — sparse towers stay disabled until the master flag is on.'
    )
  }
}

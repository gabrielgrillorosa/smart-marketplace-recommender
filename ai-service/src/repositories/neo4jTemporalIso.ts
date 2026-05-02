/**
 * Normalise Neo4j temporal values returned from Cypher (datetime / string / legacy maps) to ISO UTC string.
 */
export function neo4jTemporalValueToIso(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object' && raw !== null && 'toStandardIsoString' in raw) {
    return (raw as { toStandardIsoString: () => string }).toStandardIsoString()
  }
  if (typeof raw === 'object' && raw !== null && 'year' in raw) {
    const o = raw as unknown as {
      year: { low?: number; toNumber?: () => number } | number
      month: { toNumber?: () => number } | number
      day: { toNumber?: () => number } | number
    }
    const y = o.year
    const year =
      typeof y === 'object' && y !== null && 'toNumber' in y && typeof y.toNumber === 'function'
        ? y.toNumber()
        : Number(y)
    const m = o.month
    const month =
      typeof m === 'object' && m !== null && 'toNumber' in m && typeof m.toNumber === 'function'
        ? m.toNumber()
        : Number(m)
    const d = o.day
    const day =
      typeof d === 'object' && d !== null && 'toNumber' in d && typeof d.toNumber === 'function'
        ? d.toNumber()
        : Number(d)
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return new Date(Date.UTC(year, month - 1, day)).toISOString()
    }
  }
  return null
}

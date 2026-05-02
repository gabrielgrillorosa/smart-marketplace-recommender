/**
 * M22 — single shared extractor for item representation (A/B/C disjoint).
 * (A) text for HF stays outside this module at embedding time; (B) structural string keys;
 * (C) product id key for a separate embedding table.
 */

/** Minimal product shape for M22 extractors (avoids importing `training-utils`). */
export type M22ProductFields = {
  id: string
  name: string
  description?: string
  category: string
  price: number
  sku: string
  supplierName?: string
}

export const M22_FEATURE_SCHEMA_VERSION = '2026-05-02-1'

export const M22_OOV_TOKEN = '__OOV__'

export type ItemStructuralKeys = {
  brand: string
  category: string
  subcategory: string
  priceBucket: string
}

export type ItemRepresentationInputs = {
  /** Plain text for the HF encoder only — no structural tokens mixed in. */
  textForHF: string
  structuralKeys: ItemStructuralKeys
  /** Raw product id string for the identity tower (C); never fed into structural vocabs. */
  idKey: string
}

/** Default price bins (stable unless manifest overrides edges). */
export const DEFAULT_M22_PRICE_BIN_EDGES: readonly number[] = Object.freeze([10, 25, 50, 100, 250])

export function computePriceBucketLabel(price: number, edges: readonly number[]): string {
  const sorted = [...edges].filter((e) => Number.isFinite(e)).sort((a, b) => a - b)
  if (sorted.length === 0) return 'bucket_default'
  for (const hi of sorted) {
    if (price < hi) return `lt_${hi}`
  }
  const last = sorted[sorted.length - 1]!
  return `ge_${last}`
}

function deriveSubcategory(category: string): string {
  const parts = category.split('/').map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 1]!
  return '__NONE__'
}

export function itemRepresentationInputsFromProductDTO(
  p: M22ProductFields,
  priceBinEdges: readonly number[]
): ItemRepresentationInputs {
  const brand = (p.supplierName?.trim() || M22_OOV_TOKEN).toLowerCase()
  const category = (p.category?.trim() || M22_OOV_TOKEN).toLowerCase()
  const subcategory = deriveSubcategory(p.category ?? '')
  const priceBucket = computePriceBucketLabel(Number(p.price) || 0, priceBinEdges)
  const textForHF = [p.name?.trim() || '', p.description?.trim() || ''].filter(Boolean).join('\n').slice(0, 8000)
  return {
    textForHF,
    structuralKeys: {
      brand,
      category,
      subcategory: subcategory.toLowerCase(),
      priceBucket,
    },
    idKey: p.id,
  }
}

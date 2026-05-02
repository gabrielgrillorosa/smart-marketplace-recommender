import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  M22_FEATURE_SCHEMA_VERSION,
  M22_OOV_TOKEN,
  itemRepresentationInputsFromProductDTO,
  type ItemRepresentationInputs,
} from './itemSparseFeatureExtractor.js'
import type { M22ProductFields } from './itemSparseFeatureExtractor.js'

export const M22_ITEM_MANIFEST_FILENAME = 'm22-item-manifest.json'

export type M22ScoreRow = {
  sem384: number[]
  user384: number[]
  bBrand: number
  bCategory: number
  bSubcategory: number
  bPriceBucket: number
  cProduct: number
}

export type M22VocabLists = {
  brand: string[]
  category: string[]
  subcategory: string[]
  priceBucket: string[]
  productId: string[]
}

export type M22ItemManifest = {
  schemaVersion: string
  priceBinEdges: number[]
  structuralEnabled: true
  identityEnabled: boolean
  vocabs: M22VocabLists
  /** Embedding inputDim per tower (index 0 reserved for OOV in each vocab list). */
  vocabSizes: {
    brand: number
    category: number
    subcategory: number
    priceBucket: number
    productId: number
  }
}

export type M22IndexMaps = {
  brand: Map<string, number>
  category: Map<string, number>
  subcategory: Map<string, number>
  priceBucket: Map<string, number>
  productId: Map<string, number>
}

function sortedUniqueWithOov(tokens: Set<string>): string[] {
  const rest = [...tokens].filter((t) => t !== M22_OOV_TOKEN).sort((a, b) => a.localeCompare(b))
  return [M22_OOV_TOKEN, ...rest]
}

function toIndexMap(list: string[]): Map<string, number> {
  const m = new Map<string, number>()
  list.forEach((s, i) => m.set(s, i))
  return m
}

export function buildM22IndexMaps(manifest: M22ItemManifest): M22IndexMaps {
  return {
    brand: toIndexMap(manifest.vocabs.brand),
    category: toIndexMap(manifest.vocabs.category),
    subcategory: toIndexMap(manifest.vocabs.subcategory),
    priceBucket: toIndexMap(manifest.vocabs.priceBucket),
    productId: toIndexMap(manifest.vocabs.productId),
  }
}

export function structuralIndicesFromInputs(
  inp: ItemRepresentationKeys,
  maps: M22IndexMaps
): { bBrand: number; bCategory: number; bSubcategory: number; bPriceBucket: number } {
  return {
    bBrand: maps.brand.get(inp.structuralKeys.brand) ?? 0,
    bCategory: maps.category.get(inp.structuralKeys.category) ?? 0,
    bSubcategory: maps.subcategory.get(inp.structuralKeys.subcategory) ?? 0,
    bPriceBucket: maps.priceBucket.get(inp.structuralKeys.priceBucket) ?? 0,
  }
}

export function identityIndexFromId(productId: string, maps: M22IndexMaps, identityEnabled: boolean): number {
  if (!identityEnabled) return 0
  return maps.productId.get(productId) ?? 0
}

/** Narrow structural keys + id for index resolution (no HF text required). */
export type ItemRepresentationKeys = Pick<ItemRepresentationInputs, 'structuralKeys' | 'idKey'>

export function keysFromProductDTO(p: M22ProductFields, priceBinEdges: readonly number[]): ItemRepresentationKeys {
  const full = itemRepresentationInputsFromProductDTO(p, priceBinEdges)
  return { structuralKeys: full.structuralKeys, idKey: full.idKey }
}

export function buildM22ManifestFromProducts(
  products: M22ProductFields[],
  opts: { identityEnabled: boolean; priceBinEdges: readonly number[] }
): M22ItemManifest {
  const brands = new Set<string>([M22_OOV_TOKEN])
  const categories = new Set<string>([M22_OOV_TOKEN])
  const subcategories = new Set<string>([M22_OOV_TOKEN])
  const priceBuckets = new Set<string>([M22_OOV_TOKEN])
  const productIds = new Set<string>([M22_OOV_TOKEN])

  for (const p of products) {
    const k = keysFromProductDTO(p, opts.priceBinEdges)
    brands.add(k.structuralKeys.brand)
    categories.add(k.structuralKeys.category)
    subcategories.add(k.structuralKeys.subcategory)
    priceBuckets.add(k.structuralKeys.priceBucket)
    if (opts.identityEnabled) {
      productIds.add(k.idKey)
    }
  }

  const vocabs: M22VocabLists = {
    brand: sortedUniqueWithOov(brands),
    category: sortedUniqueWithOov(categories),
    subcategory: sortedUniqueWithOov(subcategories),
    priceBucket: sortedUniqueWithOov(priceBuckets),
    productId: sortedUniqueWithOov(productIds),
  }

  return {
    schemaVersion: M22_FEATURE_SCHEMA_VERSION,
    priceBinEdges: [...opts.priceBinEdges],
    structuralEnabled: true,
    identityEnabled: opts.identityEnabled,
    vocabs,
    vocabSizes: {
      brand: vocabs.brand.length,
      category: vocabs.category.length,
      subcategory: vocabs.subcategory.length,
      priceBucket: vocabs.priceBucket.length,
      productId: vocabs.productId.length,
    },
  }
}

export function parseM22ItemManifestJson(text: string): M22ItemManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error(`m22-item-manifest.json: invalid JSON (${e instanceof Error ? e.message : String(e)})`)
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('m22-item-manifest.json: expected object')
  const o = parsed as Record<string, unknown>
  if (o.schemaVersion !== M22_FEATURE_SCHEMA_VERSION) {
    throw new Error(`m22-item-manifest.json: unsupported schemaVersion ${JSON.stringify(o.schemaVersion)}`)
  }
  if (o.structuralEnabled !== true) throw new Error('m22-item-manifest.json: structuralEnabled must be true')
  if (typeof o.identityEnabled !== 'boolean') throw new Error('m22-item-manifest.json: identityEnabled must be boolean')
  const priceBinEdges = o.priceBinEdges
  if (!Array.isArray(priceBinEdges) || !priceBinEdges.every((x) => typeof x === 'number')) {
    throw new Error('m22-item-manifest.json: priceBinEdges must be number[]')
  }
  const v = o.vocabs as Record<string, unknown> | undefined
  if (!v || typeof v !== 'object') throw new Error('m22-item-manifest.json: missing vocabs')
  const need = ['brand', 'category', 'subcategory', 'priceBucket', 'productId'] as const
  const vocabs = {} as M22VocabLists
  for (const key of need) {
    const arr = v[key]
    if (!Array.isArray(arr) || !arr.every((x) => typeof x === 'string')) {
      throw new Error(`m22-item-manifest.json: vocabs.${key} must be string[]`)
    }
    vocabs[key] = arr as string[]
  }
  const vs = o.vocabSizes as Record<string, unknown> | undefined
  if (!vs || typeof vs !== 'object') throw new Error('m22-item-manifest.json: missing vocabSizes')
  const vocabSizes = {
    brand: Number(vs.brand),
    category: Number(vs.category),
    subcategory: Number(vs.subcategory),
    priceBucket: Number(vs.priceBucket),
    productId: Number(vs.productId),
  }
  for (const n of Object.values(vocabSizes)) {
    if (!Number.isFinite(n) || n < 1) throw new Error('m22-item-manifest.json: invalid vocabSizes')
  }
  return {
    schemaVersion: M22_FEATURE_SCHEMA_VERSION,
    priceBinEdges: priceBinEdges as number[],
    structuralEnabled: true,
    identityEnabled: o.identityEnabled as boolean,
    vocabs,
    vocabSizes,
  }
}

export async function readM22ItemManifestFromModelDir(modelDir: string): Promise<M22ItemManifest | null> {
  try {
    const filePath = path.join(modelDir.replace(/\/$/, ''), M22_ITEM_MANIFEST_FILENAME)
    const text = await fs.readFile(filePath, 'utf8')
    return parseM22ItemManifestJson(text)
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined
    if (code === 'ENOENT') return null
    throw e
  }
}

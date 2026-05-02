import neo4j, { Driver } from 'neo4j-driver'
import {
  Product,
  SearchResult,
  SearchFilters,
  ClientProfile,
  CandidateProduct,
  CatalogProductRow,
} from '../types/index.js'
import { neo4jTemporalValueToIso } from './neo4jTemporalIso.js'

/** M17 P2 — confirmed purchases with embedding + last purchase instant for profile pooling. */
export interface ClientProfilePoolRow {
  productId: string
  embedding: number[]
  lastPurchaseIso: string
}

/** Checkout / training sync: one BOUGHT row per client × product × order (idempotent by checkout_order_id). */
export interface BoughtSyncEdge {
  clientId: string
  productId: string
  orderId: string
  orderDate: string
}

export class Neo4jUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Neo4j unavailable')
    this.name = 'Neo4jUnavailableError'
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

export class ClientNotFoundError extends Error {
  readonly statusCode = 404
  constructor() {
    super('Client not found')
    this.name = 'ClientNotFoundError'
  }
}

export class Neo4jRepository {
  constructor(private readonly driver: Driver) {}

  async getProductsWithoutEmbedding(): Promise<Product[]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        'MATCH (p:Product) WHERE p.embedding IS NULL RETURN p'
      )
      return result.records.map((record) => {
        const p = record.get('p').properties
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          price: typeof p.price === 'object' ? p.price.toNumber() : Number(p.price),
          sku: p.sku,
        }
      })
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async setProductEmbedding(id: string, embedding: number[]): Promise<void> {
    const session = this.driver.session()
    try {
      await session.run(
        'MATCH (p:Product {id: $id}) SET p.embedding = $embedding',
        { id, embedding }
      )
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async createVectorIndex(): Promise<void> {
    const session = this.driver.session()
    try {
      await session.run(
        `CREATE VECTOR INDEX product_embeddings IF NOT EXISTS
         FOR (p:Product) ON (p.embedding)
         OPTIONS { indexConfig: { \`vector.dimensions\`: 384, \`vector.similarity_function\`: 'cosine' } }`
      )
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async vectorSearch(
    embedding: number[],
    limit: number,
    filters?: SearchFilters
  ): Promise<SearchResult[]> {
    const session = this.driver.session()
    try {
      const whereClauses: string[] = ['score > 0.5']
      const params: Record<string, unknown> = {
        embedding,
        limit: neo4j.int(limit),
      }

      if (filters?.country) {
        whereClauses.push('EXISTS { (p)-[:AVAILABLE_IN]->(:Country {code: $country}) }')
        params.country = filters.country
      }
      if (filters?.category) {
        whereClauses.push('EXISTS { (p)-[:BELONGS_TO]->(:Category {name: $category}) }')
        params.category = filters.category
      }

      const cypher = `
        CALL db.index.vector.queryNodes('product_embeddings', $limit, $embedding)
        YIELD node AS p, score
        WHERE ${whereClauses.join(' AND ')}
        OPTIONAL MATCH (p)-[:AVAILABLE_IN]->(c:Country)
        RETURN p.id AS id, p.name AS name, p.description AS description,
               p.category AS category, p.price AS price, p.sku AS sku, score,
               collect(c.code) AS countries
        ORDER BY score DESC
      `

      const result = await session.run(cypher, params)
      return result.records.map((record) => ({
        id: record.get('id'),
        name: record.get('name'),
        description: record.get('description'),
        category: record.get('category'),
        price: typeof record.get('price') === 'object'
          ? record.get('price').toNumber()
          : Number(record.get('price')),
        sku: record.get('sku'),
        score: record.get('score'),
        countries: (record.get('countries') as string[]) ?? [],
      }))
    } catch (err) {
      if (err instanceof Neo4jUnavailableError) throw err
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async getClientWithCountry(clientId: string): Promise<ClientProfile | null> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        'MATCH (c:Client {id: $id}) RETURN c.id AS id, c.name AS name, c.segment AS segment, c.country AS country',
        { id: clientId }
      )
      if (result.records.length === 0) return null
      const r = result.records[0]
      return {
        id: r.get('id'),
        name: r.get('name'),
        segment: r.get('segment'),
        country: r.get('country'),
      }
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async getPurchasedProductIds(clientId: string): Promise<string[]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (:Client {id: $id})-[r:BOUGHT]->(p:Product)
         WHERE coalesce(r.is_demo, false) = false
         RETURN p.id AS id`,
        { id: clientId }
      )
      return result.records.map((r) => r.get('id'))
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async getClientPurchasedEmbeddings(clientId: string): Promise<number[][]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (:Client {id: $id})-[r:BOUGHT]->(p:Product)
         WHERE coalesce(r.is_demo, false) = false
           AND p.embedding IS NOT NULL
         RETURN p.embedding AS embedding`,
        { id: clientId }
      )
      return result.records.map((r) => r.get('embedding') as number[])
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async getCandidateProducts(countryCode: string, excludedIds: string[]): Promise<CandidateProduct[]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (p:Product)-[:AVAILABLE_IN]->(:Country {code: $code})
         WHERE NOT p.id IN $excludedIds AND p.embedding IS NOT NULL
         RETURN p.id AS id, p.name AS name, p.category AS category,
                p.price AS price, p.sku AS sku, p.embedding AS embedding`,
        { code: countryCode, excludedIds }
      )
      return result.records.map((r) => ({
        id: r.get('id'),
        name: r.get('name'),
        category: r.get('category'),
        price: typeof r.get('price') === 'object' ? r.get('price').toNumber() : Number(r.get('price')),
        sku: r.get('sku'),
        embedding: r.get('embedding') as number[],
      }))
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  /**
   * M16 — all products available in country (embedding may be null) for eligibility + vitrine contract.
   */
  async getProductsInCountryCatalog(countryCode: string): Promise<CatalogProductRow[]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (p:Product)-[:AVAILABLE_IN]->(:Country {code: $code})
         RETURN p.id AS id, p.name AS name, p.category AS category,
                p.price AS price, p.sku AS sku, p.embedding AS embedding`,
        { code: countryCode }
      )
      return result.records.map((r) => ({
        id: r.get('id'),
        name: r.get('name'),
        category: r.get('category'),
        price: typeof r.get('price') === 'object' ? r.get('price').toNumber() : Number(r.get('price')),
        sku: r.get('sku'),
        embedding: (r.get('embedding') as number[] | null) ?? null,
      }))
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  /**
   * M16 — latest confirmed (non-demo) purchase date per product for the client. Missing order_date is returned as null.
   * Aggregate uses datetime(toString(...)): seed edges may store order_date as STRING while checkout uses ZONED DATETIME;
   * plain max(order_date) picks the wrong chronology across mixed types.
   */
  async getConfirmedPurchaseLastDates(clientId: string): Promise<Map<string, string | null>> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (:Client {id: $id})-[r:BOUGHT]->(p:Product)
         WHERE coalesce(r.is_demo, false) = false AND r.order_date IS NOT NULL
         RETURN p.id AS productId,
                max(datetime(toString(r.order_date))) AS lastOrderDate`,
        { id: clientId }
      )
      const map = new Map<string, string | null>()
      for (const row of result.records) {
        const productId = row.get('productId') as string
        const raw = row.get('lastOrderDate')
        map.set(productId, neo4jTemporalValueToIso(raw))
      }
      return map
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  /**
   * M17 P1 — embeddings for the most recently purchased distinct products (confirmed BOUGHT, non-demo,
   * order_date set, product embedding present). Order: latest purchase first; tie-break by productId.
   */
  async getRecentConfirmedPurchaseAnchorEmbeddings(
    clientId: string,
    limit: number
  ): Promise<number[][]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (:Client {id: $id})-[r:BOUGHT]->(p:Product)
         WHERE coalesce(r.is_demo, false) = false
           AND r.order_date IS NOT NULL
           AND p.embedding IS NOT NULL
         WITH p.id AS productId, p.embedding AS embedding,
              max(datetime(toString(r.order_date))) AS lastPurchase
         ORDER BY lastPurchase DESC, productId ASC
         LIMIT $limit
         RETURN embedding AS embedding`,
        { id: clientId, limit: neo4j.int(limit) }
      )
      return result.records.map((r) => r.get('embedding') as number[])
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  /**
   * M17 P2 — full profile pool: distinct products with embedding + latest confirmed purchase instant.
   * Same eligibility as P1 anchors; no LIMIT (PRS-26).
   */
  async getClientProfilePoolForAggregation(clientId: string): Promise<ClientProfilePoolRow[]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (:Client {id: $id})-[r:BOUGHT]->(p:Product)
         WHERE coalesce(r.is_demo, false) = false
           AND r.order_date IS NOT NULL
           AND p.embedding IS NOT NULL
         WITH p.id AS productId, p.embedding AS embedding,
              max(datetime(toString(r.order_date))) AS lastPurchase
         ORDER BY lastPurchase DESC, productId ASC
         RETURN productId, embedding, lastPurchase`,
        { id: clientId }
      )
      const rows: ClientProfilePoolRow[] = []
      for (const row of result.records) {
        const productId = row.get('productId') as string
        const embedding = row.get('embedding') as number[]
        const iso = neo4jTemporalValueToIso(row.get('lastPurchase'))
        if (!iso) continue
        rows.push({ productId, embedding, lastPurchaseIso: iso })
      }
      return rows
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async getAllProductEmbeddings(): Promise<{ id: string; embedding: number[] }[]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        'MATCH (p:Product) WHERE p.embedding IS NOT NULL RETURN p.id AS id, p.embedding AS embedding'
      )
      return result.records.map((r) => ({
        id: r.get('id'),
        embedding: r.get('embedding') as number[],
      }))
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async syncBoughtRelationships(
    edges: BoughtSyncEdge[]
  ): Promise<{ created: number; existed: number; skipped: number }> {
    if (edges.length === 0) return { created: 0, existed: 0, skipped: 0 }

    const session = this.driver.session()
    try {
      const result = await session.run(
        `UNWIND $edges AS edge
         OPTIONAL MATCH (c:Client {id: edge.clientId})
         OPTIONAL MATCH (p:Product {id: edge.productId})
         WITH edge, c, p
         WHERE c IS NOT NULL AND p IS NOT NULL
         OPTIONAL MATCH (c)-[ex:BOUGHT {checkout_order_id: edge.orderId}]->(p)
         WITH edge, c, p, (ex IS NOT NULL) AS alreadyThere
         MERGE (c)-[r:BOUGHT {checkout_order_id: edge.orderId}]->(p)
         SET r.order_date = datetime(edge.orderDate),
             r.is_demo = false
         RETURN count(*) AS processed,
                sum(CASE WHEN alreadyThere THEN 1 ELSE 0 END) AS existed,
                sum(CASE WHEN NOT alreadyThere THEN 1 ELSE 0 END) AS created`,
        { edges }
      )

      const record = result.records[0]
      const toNum = (v: unknown): number => {
        if (v == null) return 0
        if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
          return (v as { toNumber: () => number }).toNumber()
        }
        return Number(v)
      }

      const processed = record ? toNum(record.get('processed')) : 0
      const createdCount = record ? toNum(record.get('created')) : 0
      const existedCount = record ? toNum(record.get('existed')) : 0
      const skippedCount = edges.length - processed

      return {
        created: createdCount,
        existed: existedCount,
        skipped: skippedCount < 0 ? 0 : skippedCount,
      }
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async close(): Promise<void> {
    await this.driver.close()
  }

  async createProductWithEmbedding(
    product: {
      id: string
      name: string
      description: string
      category: string
      price: number
      sku: string
      countryCodes: string[]
    },
    embedding: number[]
  ): Promise<void> {
    const session = this.driver.session()
    try {
      await session.run(
        `MERGE (p:Product {id: $id})
         ON CREATE SET p.name = $name, p.description = $description,
                       p.category = $category, p.price = $price, p.sku = $sku
         WITH p
         FOREACH (code IN $countryCodes |
           MERGE (c:Country {code: code})
           MERGE (p)-[:AVAILABLE_IN]->(c)
         )
         WITH p
         WHERE p.embedding IS NULL
         SET p.embedding = $embedding`,
        {
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.category,
          price: product.price,
          sku: product.sku,
          countryCodes: product.countryCodes,
          embedding,
        }
      )
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async getProductEmbedding(productId: string): Promise<number[] | null> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        'MATCH (p:Product {id: $id}) RETURN p.embedding AS embedding',
        { id: productId }
      )
      if (result.records.length === 0) return null
      const embedding = result.records[0].get('embedding')
      return embedding ?? null
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async getProductEmbeddings(productIds: string[]): Promise<number[][]> {
    if (productIds.length === 0) {
      return []
    }

    const session = this.driver.session()
    try {
      const result = await session.run(
        `UNWIND $productIds AS productId
         MATCH (p:Product {id: productId})
         WHERE p.embedding IS NOT NULL
         RETURN p.embedding AS embedding`,
        { productIds }
      )

      return result.records.map((r) => r.get('embedding') as number[])
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }
}

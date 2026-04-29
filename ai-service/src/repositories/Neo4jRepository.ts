import neo4j, { Driver } from 'neo4j-driver'
import { Product, SearchResult, SearchFilters, ClientProfile, CandidateProduct } from '../types/index.js'

export class Neo4jUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Neo4j unavailable')
    this.name = 'Neo4jUnavailableError'
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

export class ProductNotFoundError extends Error {
  readonly statusCode = 404
  constructor() {
    super('Product not found')
    this.name = 'ProductNotFoundError'
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
    edges: Array<{ clientId: string; productId: string }>
  ): Promise<{ created: number; existed: number; skipped: number }> {
    if (edges.length === 0) return { created: 0, existed: 0, skipped: 0 }

    const session = this.driver.session()
    try {
      const result = await session.run(
        `UNWIND $edges AS edge
         MATCH (c:Client {id: edge.clientId})
         MATCH (p:Product {id: edge.productId})
         MERGE (c)-[r:BOUGHT]->(p)
         ON CREATE SET r.synced = true
         RETURN count(r) AS total, sum(CASE WHEN r.synced = true THEN 1 ELSE 0 END) AS created`,
        { edges }
      )

      const record = result.records[0]
      const total = record ? (record.get('total') as { toNumber?: () => number } | number) : 0
      const createdRaw = record ? (record.get('created') as { toNumber?: () => number } | number) : 0

      const totalCount = typeof total === 'object' && total.toNumber ? total.toNumber() : Number(total)
      const createdCount = typeof createdRaw === 'object' && createdRaw.toNumber ? createdRaw.toNumber() : Number(createdRaw)
      const existedCount = totalCount - createdCount
      const skippedCount = edges.length - totalCount

      return { created: createdCount, existed: existedCount, skipped: skippedCount < 0 ? 0 : skippedCount }
    } catch (err) {
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async getAllDemoBoughtPairs(): Promise<{ clientId: string; productId: string }[]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (c:Client)-[r:BOUGHT]->(p:Product)
         WHERE r.is_demo = true
         RETURN c.id AS clientId, p.id AS productId`
      )
      return result.records.map((r) => ({
        clientId: r.get('clientId') as string,
        productId: r.get('productId') as string,
      }))
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

  async createDemoBoughtAndGetEmbeddings(clientId: string, productId: string): Promise<number[][]> {
    const session = this.driver.session()
    try {
      const result = await session.executeWrite((tx) =>
        tx.run(
          `MATCH (c:Client {id: $clientId})
           MATCH (p:Product {id: $productId})
           MERGE (c)-[r:BOUGHT {is_demo: true}]->(p)
           ON CREATE SET r.date = datetime()
           WITH c
           MATCH (c)-[:BOUGHT]->(bought:Product)
           WHERE bought.embedding IS NOT NULL
           RETURN bought.embedding AS embedding`,
          { clientId, productId }
        )
      )
      if (result.records.length === 0) {
        // Check if client exists at all
        const clientCheck = await session.run(
          'MATCH (c:Client {id: $clientId}) RETURN count(c) AS cnt',
          { clientId }
        )
        const cnt = clientCheck.records[0]?.get('cnt')
        const count = typeof cnt === 'object' && cnt?.toNumber ? cnt.toNumber() : Number(cnt ?? 0)
        if (count === 0) throw new ClientNotFoundError()
        // Product not found
        const productCheck = await session.run(
          'MATCH (p:Product {id: $productId}) RETURN count(p) AS cnt',
          { productId }
        )
        const pcnt = productCheck.records[0]?.get('cnt')
        const pcount = typeof pcnt === 'object' && pcnt?.toNumber ? pcnt.toNumber() : Number(pcnt ?? 0)
        if (pcount === 0) throw new ProductNotFoundError()
        return []
      }
      return result.records.map((r) => r.get('embedding') as number[])
    } catch (err) {
      if (err instanceof ClientNotFoundError || err instanceof ProductNotFoundError) throw err
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async deleteDemoBoughtAndGetEmbeddings(clientId: string, productId: string): Promise<number[][]> {
    const session = this.driver.session()
    try {
      const result = await session.executeWrite((tx) =>
        tx.run(
          `MATCH (c:Client {id: $clientId})
           OPTIONAL MATCH (c)-[r:BOUGHT {is_demo: true}]->(p:Product {id: $productId})
           DELETE r
           WITH c
           MATCH (c)-[:BOUGHT]->(bought:Product)
           WHERE bought.embedding IS NOT NULL
           RETURN bought.embedding AS embedding`,
          { clientId, productId }
        )
      )
      if (result.records.length === 0) {
        const clientCheck = await session.run(
          'MATCH (c:Client {id: $clientId}) RETURN count(c) AS cnt',
          { clientId }
        )
        const cnt = clientCheck.records[0]?.get('cnt')
        const count = typeof cnt === 'object' && cnt?.toNumber ? cnt.toNumber() : Number(cnt ?? 0)
        if (count === 0) throw new ClientNotFoundError()
        return []
      }
      return result.records.map((r) => r.get('embedding') as number[])
    } catch (err) {
      if (err instanceof ClientNotFoundError) throw err
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }

  async clearAllDemoBoughtAndGetEmbeddings(clientId: string): Promise<number[][]> {
    const session = this.driver.session()
    try {
      const result = await session.executeWrite((tx) =>
        tx.run(
          `MATCH (c:Client {id: $clientId})
           OPTIONAL MATCH (c)-[r:BOUGHT {is_demo: true}]->()
           DELETE r
           WITH c
           OPTIONAL MATCH (c)-[:BOUGHT]->(bought:Product)
           WHERE bought.embedding IS NOT NULL
           RETURN bought.embedding AS embedding`,
          { clientId }
        )
      )
      if (result.records.length === 0) {
        const clientCheck = await session.run(
          'MATCH (c:Client {id: $clientId}) RETURN count(c) AS cnt',
          { clientId }
        )
        const cnt = clientCheck.records[0]?.get('cnt')
        const count = typeof cnt === 'object' && cnt?.toNumber ? cnt.toNumber() : Number(cnt ?? 0)
        if (count === 0) throw new ClientNotFoundError()
        return []
      }
      return result.records
        .filter((r) => r.get('embedding') !== null)
        .map((r) => r.get('embedding') as number[])
    } catch (err) {
      if (err instanceof ClientNotFoundError) throw err
      throw new Neo4jUnavailableError(err)
    } finally {
      await session.close()
    }
  }
}

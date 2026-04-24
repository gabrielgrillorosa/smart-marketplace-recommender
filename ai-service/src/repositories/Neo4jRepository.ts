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
         OPTIONS { indexConfig: { 'vector.dimensions': 384, 'vector.similarity_function': 'cosine' } }`
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
        RETURN p.id AS id, p.name AS name, p.description AS description,
               p.category AS category, p.price AS price, p.sku AS sku, score
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
        'MATCH (:Client {id: $id})-[:BOUGHT]->(p:Product) RETURN p.id AS id',
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
        'MATCH (:Client {id: $id})-[:BOUGHT]->(p:Product) WHERE p.embedding IS NOT NULL RETURN p.embedding AS embedding',
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

  async close(): Promise<void> {
    await this.driver.close()
  }
}

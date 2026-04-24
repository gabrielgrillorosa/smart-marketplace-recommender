import neo4j, { Driver } from 'neo4j-driver'
import { Product, SearchResult, SearchFilters } from '../types/index.js'

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

  async close(): Promise<void> {
    await this.driver.close()
  }
}

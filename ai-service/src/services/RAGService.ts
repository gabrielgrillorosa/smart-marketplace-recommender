import { ChatOpenAI } from '@langchain/openai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { EmbeddingService } from './EmbeddingService.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { RAGResponse, Source } from '../types/index.js'
import { ModelNotReadyError } from './SearchService.js'

export class LLMNotConfiguredError extends Error {
  constructor() {
    super('LLM not configured. Set OPENROUTER_API_KEY env var.')
    this.name = 'LLMNotConfiguredError'
  }
}

export class LLMError extends Error {
  sources: Source[]
  constructor(message: string, sources: Source[]) {
    super(message)
    this.name = 'LLMError'
    this.sources = sources
  }
}

const SYSTEM_PROMPT = `You are a helpful product catalog assistant for a B2B marketplace.
Answer the user's question using ONLY the product information provided in the context below.
If the context does not contain enough information to answer the question, respond with:
"Não encontrei produtos que correspondam à sua pergunta." (if the query is in Portuguese)
or "I could not find products matching your query." (if the query is in English).
Do not make up information. Do not reference products not listed in the context.

Context:
{context}`

export class RAGService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly repo: Neo4jRepository,
    private readonly openRouterApiKey: string | undefined,
    private readonly modelName: string
  ) {}

  async query(userQuery: string): Promise<RAGResponse> {
    if (!this.openRouterApiKey) {
      throw new LLMNotConfiguredError()
    }

    if (!this.embeddingService.isReady) {
      throw new ModelNotReadyError()
    }

    const truncatedQuery = userQuery.slice(0, 1000)

    const embedding = await this.embeddingService.embedText(truncatedQuery)
    const searchResults = await this.repo.vectorSearch(embedding, 5)

    const sources: Source[] = searchResults.map((r) => ({
      id: r.id,
      name: r.name,
      score: r.score,
    }))

    if (sources.length === 0) {
      return {
        answer: 'Não encontrei produtos que correspondam à sua pergunta.',
        sources: [],
      }
    }

    const context = searchResults
      .map(
        (r) =>
          `- [${r.name}] (SKU: ${r.sku}, Categoria: ${r.category}, Preço: R$ ${r.price}): ${r.description}`
      )
      .join('\n')

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', SYSTEM_PROMPT],
      ['human', '{question}'],
    ])

    const llm = new ChatOpenAI({
      model: this.modelName,
      apiKey: this.openRouterApiKey,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
    })

    const chain = RunnableSequence.from([
      prompt,
      llm,
      new StringOutputParser(),
    ])

    try {
      const answer = await chain.invoke({
        context,
        question: truncatedQuery,
      })
      return { answer, sources }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LLM request failed'
      throw new LLMError(message, sources)
    }
  }
}

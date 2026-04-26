import { ChatOpenAI } from '@langchain/openai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { EmbeddingService } from './EmbeddingService.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { RAGResponse, Source } from '../types/index.js'
import { ModelNotReadyError } from './SearchService.js'
import { RAG_SYSTEM_PROMPT } from '../prompts/rag.js'

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

export class RAGService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly repo: Neo4jRepository,
    private readonly openRouterApiKey: string | undefined,
    private readonly modelName: string,
    private readonly openRouterBaseUrl: string
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
    const searchResults = await this.repo.vectorSearch(embedding, 8)

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
          `- [${r.name}] (SKU: ${r.sku}, Categoria: ${r.category}, Preço: R$ ${r.price}, Disponível em: ${r.countries.length > 0 ? r.countries.join(', ') : 'N/A'}): ${r.description}`
      )
      .join('\n')

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', RAG_SYSTEM_PROMPT],
      ['human', '{question}'],
    ])

    const llm = new ChatOpenAI({
      model: this.modelName,
      apiKey: this.openRouterApiKey,
      configuration: {
        baseURL: this.openRouterBaseUrl,
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

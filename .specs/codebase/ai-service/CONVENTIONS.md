# Conventions — AI Service
**Serviço:** ai-service (TypeScript / Fastify / Node.js 22)
**Analisado:** 2026-04-26

---

## Nomenclatura de arquivos

| Tipo | Padrão | Exemplos |
|---|---|---|
| Service class | PascalCase + `.ts` | `RecommendationService.ts`, `TrainingJobRegistry.ts` |
| Repository | PascalCase + `Repository.ts` | `Neo4jRepository.ts` |
| Route handler | camelCase + `Routes.ts` ou `routes.ts` | `adminRoutes.ts`, `embeddings.ts` |
| Config | camelCase + `.ts` | `env.ts` |
| Test | `[nome].test.ts` no mesmo diretório | `TrainingJobRegistry.test.ts`, `VersionedModelStore.test.ts` |
| Test de rota | em `src/tests/` | `recommend.test.ts`, `rag.test.ts` |

## Nomenclatura de classes e métodos

- Classes: PascalCase — `Neo4jRepository`, `EmbeddingService`, `ModelTrainer`
- Métodos públicos: camelCase — `recommend()`, `generateEmbeddings()`, `getClientWithCountry()`
- Erros customizados: PascalCase + `Error` suffix — `ModelNotTrainedError`, `Neo4jUnavailableError`
- Constantes de config: SCREAMING_SNAKE_CASE via `ENV.NEURAL_WEIGHT`

## Injeção de dependência

Todas as classes recebem dependências via constructor — sem singleton global exceto o driver Neo4j. Exemplo:
```ts
export class RecommendationService {
  constructor(
    private readonly modelStore: ModelStore,
    private readonly repo: Neo4jRepository,
    private readonly neuralWeight: number,
    private readonly semanticWeight: number,
    private readonly logger?: FastifyBaseLogger
  ) {}
}
```

## Padrão de importação

Imports usam extensão `.js` explícita (necessário para ESM TypeScript):
```ts
import { ENV } from './config/env.js'
import { Neo4jRepository } from './repositories/Neo4jRepository.js'
```

## Registro de rotas Fastify

Rotas registradas via `fastify.register(plugin, { prefix: '/api/v1', ...deps })`. Cada plugin recebe suas dependências como opções no momento do registro — não acessam singletons globais.

## Padrão de error handling nas rotas

```ts
try {
  const result = await service.method(params)
  return reply.code(200).send(result)
} catch (err) {
  if (err instanceof KnownError) {
    return reply.code(err.statusCode).send({ error: err.message })
  }
  request.log.error(err)
  return reply.code(500).send({ error: 'Internal server error' })
}
```

## Session Neo4j (padrão mandatório)

```ts
const session = this.driver.session()
try {
  const result = await session.run(cypher, params)
  // processar resultado
} finally {
  await session.close()  // SEMPRE no finally
}
```

## TF.js — regra de I/O boundary

Nunca misturar `await` com operações de tensor dentro de `tf.tidy()`. Todo I/O assíncrono deve completar antes de entrar no `tidy()`.

## Logs

Fastify logger (`fastify.log`) usado nas rotas. Services recebem `logger?: FastifyBaseLogger` como parâmetro opcional para evitar dependência em testes.

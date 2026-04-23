# ADR-003: Estrutura Modular de Serviços para o AI Service

**Status**: Accepted
**Date**: 2026-04-23

## Context

O `src/index.ts` existente é um monólito de 20 linhas com um único endpoint `/health`. O M3 adiciona 4 novos endpoints (embeddings, busca semântica, RAG, readiness) com dependências cruzadas: modelo de embedding compartilhado entre busca e RAG, repositório Neo4j compartilhado entre todos os serviços, e configuração de env vars centralizada. Sem estrutura de diretórios, tudo converge em um único arquivo — impossibilitando testabilidade isolada e extensão para M4 (modelo neural). O committee review (Principal SW Architect) identificou isso como High severity: a ausência de separação de camadas violaria SRP e tornaria M4 um refactor total em vez de uma extensão.

## Decision

Adotar estrutura de camadas explícita: `src/config/` → `src/repositories/` → `src/services/` → `src/routes/` → `src/index.ts`. Cada camada depende apenas da camada imediatamente inferior. Rotas registradas via `fastify.register(plugin, { prefix: '/api/v1' })`.

## Alternatives considered

- **Monólito em `index.ts`**: Descartado. Todos os serviços, repositórios e rotas em um arquivo torna o crescimento para M4 um refactor em vez de uma extensão. SRP violado desde o início.
- **Estrutura por feature (embeddings/, search/, rag/)**: Descartada. Com 3 features que compartilham `EmbeddingService` e `Neo4jRepository`, a estrutura por feature duplicaria dependências ou exigiria um diretório `shared/` que na prática recria a estrutura por camada.

## Consequences

- `EmbeddingService` é instanciado uma vez no `index.ts` e injetado nos serviços que dependem dele — sem singleton global implícito.
- M4 adiciona `NeuralService` e `RecommendService` na camada de serviços sem tocar nas camadas de rotas ou repositório existentes.
- Testabilidade: cada serviço recebe suas dependências via constructor — mockável sem framework de DI.
- Risco remanescente: injeção de dependência manual no `index.ts` cresce linearmente com novos serviços; aceitável para M3-M4; documentado como candidato a framework de DI (e.g., `awilix`) em M6.

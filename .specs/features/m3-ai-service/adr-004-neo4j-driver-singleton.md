# ADR-004: Neo4j Driver como Singleton com Sessions por Operação

**Status**: Accepted
**Date**: 2026-04-23

## Context

O `seed.ts` cria e fecha o driver Neo4j dentro do próprio script de execução única. Para um serviço HTTP de longa duração, esse padrão causa dois problemas convergentes identificados pelo committee review (Principal SW Architect + Staff Engineering — High severity): (1) se o driver for criado por request, o overhead de autenticação e handshake TLS é pago a cada chamada; (2) se sessions forem abertas sem `try/finally`, qualquer exceção durante execução de Cypher vaza a session, esgotando o connection pool sob carga. A tensão original do design era entre usar `Neo4jVectorStore` (abstração LangChain) ou `neo4j-driver` direto — o Node B (LangChain) foi eliminado por incompatibilidade com o schema de `Product` nodes.

## Decision

Instanciar o `neo4j-driver` Driver uma única vez no `src/index.ts` durante o startup e injetá-lo no `Neo4jRepository` via constructor. Cada método do repositório abre uma session, executa a operação, e fecha a session em bloco `try/finally` — garantindo fechamento mesmo em caso de exceção.

## Alternatives considered

- **Driver por request**: Descartado. Overhead de conexão + autenticação por request é inaceitável para endpoints de busca semântica onde latência importa.
- **`Neo4jVectorStore` (LangChain) gerenciando o driver**: Descartado na Phase 2 (Node B eliminado). `Neo4jVectorStore.fromExistingGraph` opera sobre nós `Chunk` com schema interno LangChain — incompatível com a necessidade de gravar `embedding` diretamente em `Product` nodes existentes e criar o index `product_embeddings` com nome controlado.
- **Session compartilhada por serviço**: Descartado. Sessions Neo4j não são thread-safe para operações concorrentes; uma session por operação é o padrão recomendado pelo driver oficial.

## Consequences

- Connection pool do driver é gerenciado automaticamente pelo `neo4j-driver` (default: 100 conexões) — sem configuração adicional necessária para MVP.
- `driver.close()` deve ser chamado no shutdown do processo (SIGTERM handler no `index.ts`).
- Risco remanescente: sem retry automático em falhas transitórias de rede (ex: Neo4j restart). Para MVP, o erro sobe como HTTP 503. Retry com backoff exponencial é melhoria documentada para M6.
- Todo Cypher fica centralizado no `Neo4jRepository` — única responsabilidade, única fonte de verdade para queries.

# ADR-021: Transação unificada Neo4j para createDemoBought + getEmbeddings

**Status**: Accepted
**Date**: 2026-04-26

## Context

O fluxo `POST /demo-buy` requer duas operações sequenciais no Neo4j: (1) criar a edge `(:Client)-[:BOUGHT {is_demo: true}]->(:Product)` e (2) ler todos os embeddings de produtos comprados pelo cliente para recalcular o `clientProfileVector`. Se essas operações forem executadas em sessões separadas, há uma janela de tempo em que a edge recém-criada pode não ter sido propagada quando o SELECT de embeddings é executado — resultando em um `profileVector` que não inclui a compra demo. O problema foi identificado pelo Staff Engineering como risco de race condition (High severity) e confirmado implicitamente pelo QA Staff na análise do caso "cold start" (M9A-32).

## Decision

Implementar `createDemoBoughtAndGetEmbeddings(clientId: string, productId: string): Promise<number[][]>` no `Neo4jRepository`. O método executa write + read em uma única sessão Neo4j via `session.executeWrite()`: a transação cria a edge `BOUGHT {is_demo: true, date: now()}` via `MERGE` e retorna imediatamente todos os embeddings de produtos comprados pelo cliente (`WHERE p.embedding IS NOT NULL`) no mesmo escopo transacional.

## Alternatives considered

- **Duas sessões separadas**: `createDemoBought()` em sessão 1, `getClientPurchasedEmbeddings()` em sessão 2. Descartado — timing gap entre sessões pode produzir `profileVector` sem a compra demo, tornando o feedback visual incorreto e o teste M9A-31/M9A-32 indeterminístico.
- **Retry com backoff**: aguardar propagação com `setTimeout` antes do SELECT. Descartado — aumenta latência, não elimina o race condition, e adiciona complexidade desnecessária.

## Consequences

- A edge e os embeddings são sempre consistentes — a write transaction garante que o MATCH posterior vê o MERGE já commitado.
- Latência estimada não aumenta: o round-trip adicional de uma segunda sessão era ~10–20ms; a transação unificada elimina esse overhead.
- O método `createDemoBought()` individual (write only) ainda pode ser implementado separadamente para casos de uso que não precisam dos embeddings, mas não é necessário para M9-A.
- `session.executeWrite()` usa retries automáticos do driver Neo4j em caso de deadlock — comportamento mais robusto que `session.run()` direto.

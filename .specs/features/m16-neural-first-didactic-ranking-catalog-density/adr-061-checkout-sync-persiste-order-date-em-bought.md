# ADR-061: Checkout → Neo4j — Persistir `order_date` em `BOUGHT` no Sync Assíncrono

**Status:** Accepted — **implementado** ✓ (2026-04-30)  
**Date:** 2026-04-29  

## Context and Problem Statement

O fluxo M13 já está correto ao nível de orquestração: o `api-service` confirma o pedido no PostgreSQL, limpa o carrinho na mesma transacção e, **após `afterCommit`**, notifica o `ai-service` com `POST /api/v1/orders/:orderId/sync-and-train` (fire-and-forget).

Contudo, a implementação de `Neo4jRepository.syncBoughtRelationships` usada por essa rota fazia `MERGE (Client)-[:BOUGHT]->(Product)` sem gravar **`order_date`** nas arestas criadas/atualizadas pelo checkout. O seed (`seed.ts`) já define `order_date` nas relações geradas a partir de pedidos sintéticos.

Sem `order_date` nas arestas vindas do checkout real, a consulta `getConfirmedPurchaseLastDates` (`max(r.order_date)`) não devolve datas para esses produtos → `RecommendationService.computeEligibility` não classifica `recently_purchased` → **painel «Compras recentes» e badges M16 permanecem vazios** após compras reais, apesar do fluxo api→ai estar ligado.

Esta lacuna não contradiz o ADR-060 ao nível de *fonte de verdade* (Neo4j + `BOUGHT.order_date`), mas exige **fecho implementacional** explícito no caminho de sync pós-checkout.

## Decision Drivers

- O grafo deve ser suficiente para elegibilidade sem HTTP extra ao `api-service` em cada `/recommend` (ADR-060).
- Uma compra confirmada deve produzir evidência temporal inequívoca para a janela `RECENT_PURCHASE_WINDOW_DAYS`.
- Idempotência: reenvio do mesmo pedido não deve duplicar arestas incoerentes nem apagar histórico seed.

## Decision Outcome

**Decisão:** Estender o contrato interno `sync-and-train` e o `syncBoughtRelationships` (ou método dedicado) para:

1. **`api-service`**: incluir no corpo JSON enviado ao `ai-service` a **data/hora do pedido** (`orderDate`), em **ISO-8601**, derivada do `Order.orderDate` já persistido após `createOrder` (ex.: `Instant` / offset consistente).
2. **`ai-service`**: para cada par `(clientId, productId)` do checkout, criar ou actualizar uma aresta `BOUGHT` que grave **`order_date`** (string ISO alinhada ao seed), **`is_demo = false`**, e um identificador estável por linha de pedido (ex.: propriedade relacionada ao `orderId`) para **MERGE idempotente** entre o mesmo pedido e o mesmo produto, sem colidir com arestas `BOUGHT` históricas do seed que usem `item_id` diferente.
3. Manter o comportamento **assíncrono** e **best-effort**: falha no sync não reverte o pedido em PostgreSQL (política já descrita no ADR-043).

Chosen porque mantém uma única fonte de verdade no grafo, satisfaz NFD/M16 e corrige o sintoma observado em produção/demo sem mudar o contrato público do checkout.

### Positive Consequences

- «Compras recentes», prefetch `eligibilityOnly` e ranking passam a reflectir compras reais.
- Alinhamento explícito com a consequência já escrita no ADR-060 (linha sobre sync checkout).

### Negative Consequences

- Payload e Cypher ligeiramente mais complexos; testes de rota e possivelmente de integração Neo4j devem cobrir o novo campo.
- `ModelTrainer.syncNeo4j` (sync em batch a partir de dados do api-service) pode precisar de passar datas por pedido para consistência; caso contrário permanece apenas relevante para treino, não para o bug de UI pós-checkout.

## Considered Options

- **A — Gravar só no primeiro `MERGE` genérico sem data**: rejeitado — foi o estado que causou o bug.
- **B — Consultar sempre o PostgreSQL no `ai-service` por data de pedido**: rejeitado — acoplamento e I/O no hot path / sync duplicado; contradiz ADR-060.
- **C — Payload com `orderDate` + MERGE idempotente com `order_date` nas arestas**: escolhido.

## Links

- [ADR-060](./adr-060-recent-suppression-neo4j-order-date.md) — supressão por `BOUGHT.order_date`
- [ADR-043](../m13-cart-checkout-async-retrain/adr-043-cart-order-ground-truth-after-commit-sync.md) — sync após commit
- Rotas: `api-service` `AiSyncClient.notifyCheckoutCompleted`, `ai-service` `ordersRoutes` + `Neo4jRepository.syncBoughtRelationships`

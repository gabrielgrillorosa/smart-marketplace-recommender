# ADR-060: Supressão por Compra Recente no Neo4j Usando `BOUGHT.order_date`

**Status**: Accepted  
**Date**: 2026-04-29  

## Context

O spec M16 exige que a janela `RECENT_PURCHASE_WINDOW_DAYS` aplique-se apenas a compras **confirmadas** (pedidos reais), não ao carrinho nem a edges `is_demo`. O `Neo4jRepository` já persiste `BOUGHT` com propriedade `order_date` no seed (`seed.ts` faz `SET b.order_date = r.order_date`). O checkout em produção deve manter a mesma propriedade ao sincronizar pedidos.

A tensão é entre consultar o **api-service** em cada recomendação para obter datas de pedido versus derivar exclusivamente do grafo.

## Decision

Implementar exclusão da **camada de candidatos** no `Neo4jRepository`: nova consulta ou extensão de `getCandidateProducts` / método auxiliar que exclui produtos cuja **última** compra confirmada pelo cliente esteja dentro da janela `[now - RECENT_PURCHASE_WINDOW_DAYS, now]`, usando `BOUGHT.order_date` onde `coalesce(r.is_demo, false) = false`.

Para produtos comprados múltiplas vezes, usar a **data mais recente** por par `(clientId, productId)` via agregação Cypher (`max(r.order_date)`).

Retornar metadados de supressão (`eligible`, `reason`, `suppressionUntil = lastPurchase + window`) para o `RecommendationService` montar a resposta unificada (alinhado ao ADR-055).

## Alternatives considered

- **HTTP ao api-service em cada `/recommend`**: Descartado — latência adicional, acoplamento ao Java em hot path, falha parcial se API estiver lenta; o grafo já é fonte de verdade para recomendação.
- **Suprimir apenas por lista de IDs sem data**: Descartado — não permite `suppressionUntil` nem expiração automática da janela sem novo pedido.

## Consequences

- `RecommendationService` passa `RECENT_PURCHASE_WINDOW_DAYS` do `env.ts` (default `7`).
- Se `order_date` estiver ausente em edges antigas (improvável pós-seed unificado), fallback conservador: tratar como fora da janela ou como inelegível — decisão documentada na implementação com teste de regressão.
- Sincronização checkout → Neo4j deve garantir `order_date` ISO nas novas edges `BOUGHT` (verificar path existente em `syncBoughtRelationships` / orders routes).

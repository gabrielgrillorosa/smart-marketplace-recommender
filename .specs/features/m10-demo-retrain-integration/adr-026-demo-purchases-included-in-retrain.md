# ADR-026: Incluir compras demo (is_demo:true) no clientProfileVector durante o retreinamento

**Status**: Accepted
**Date**: 2026-04-26

## Context

O `ModelTrainer.train()` constrói o `clientOrderMap` exclusivamente a partir de pedidos do
PostgreSQL via `fetchTrainingData(apiServiceUrl)`. As compras demo criadas pelo M9-A existem
apenas como edges `BOUGHT {is_demo: true}` no Neo4j — elas participam do `clientProfileVector`
em tempo real via `getClientPurchasedEmbeddings()`, mas são completamente invisíveis ao processo
de retreinamento completo do modelo neural.

O cenário motivador: o avaliador faz 5 compras demo no catálogo, vai à aba Análise e clica
"Retreinar Modelo". O modelo treinado não reflete as demos porque o `clientOrderMap` nunca as viu.
As edges `is_demo: true` foram projetadas no M9-A com flag explícita para isolamento e limpeza
(`clearAllDemoBought`); esta decisão preserva esse isolamento enquanto permite que o retreinamento
consuma as demos como sinal de treino.

## Decision

Adicionar `Neo4jRepository.getAllDemoBoughtPairs()` — query batch que retorna todos os pares
`{ clientId, productId }` de edges `BOUGHT` onde `r.is_demo = true`. O `ModelTrainer.train()`
chama este método após `fetchTrainingData()` e mescla os pares no `clientOrderMap` antes de
construir os tensores `xs`/`ys`. A query é executada em bloco `try/catch` non-fatal, igual ao
padrão já estabelecido para `syncNeo4j` (linha 257 do `ModelTrainer`).

## Alternatives considered

- **Node A — N queries por cliente** (`getDemoBoughtEdges(clientId)` chamado em loop): mesmo resultado mas O(N) roundtrips ao Neo4j — descartado por pressão de I/O desnecessária quando uma query batch resolve o mesmo problema.
- **Node C — colapso is_demo no syncBoughtRelationships**: modificar `syncBoughtRelationships()` para incluir edges demo no sync sem distinção eliminaria a separação `is_demo/real` — descartado porque cria race condition destrutiva: `clearAllDemoBought` do M9-A poderia deletar edges que o `ModelTrainer` acabou de sincronizar (High severity, Phase 2).

## Consequences

- Compras demo feitas antes de um retreinamento são absorvidas pelo modelo como sinal positivo de preferência.
- Deduplicação garantida: `clientOrderMap` usa `Set<string>` por `productId` — uma demo e um pedido real do mesmo produto não duplicam o vetor.
- Clientes com demos mas sem pedidos reais agora entram no treino (a mescla cria entradas novas no map para esses clientes).
- Se a query Neo4j de demos falhar, o treino continua normalmente sem as demos — graceful degradation com log de aviso.
- Trade-off aceito: demos têm o mesmo peso que pedidos reais no tensor (sem ponderação diferenciada por confiança do sinal). Weighted pooling por fonte continua deferido (ver Deferred Ideas).
- Zero mudança de interface pública: `Neo4jRepository` adiciona um método; `ModelTrainer` adiciona ~10 linhas internas; nenhuma rota, nenhum tipo exportado, nenhuma mudança de UI.

# ADR-065: M17 P2 — agregação partilhada de perfil e alinhamento temporal treino/inferência

**Status**: Accepted  
**Date**: 2026-05-01

## Context

A Fase 2 do M17 exige pooling exponencial do vector de perfil **idêntico** em `buildTrainingDataset` e nos fluxos `recommend` / `recommendFromCart` ([spec PRS-11–12, PRS-23–28](./spec.md)). Hoje existem **três** implementações independentes de média aritmética (`RecommendationService.meanPooling`, `training-utils.meanPooling`, `rankingEval.meanPooling`), e o treino recebe apenas `Map<clientId, Set<productId>>` sem datas — insuficiente para \(t_i\) e \(T_{\mathrm{ref}}^{\,(c)}\). A inferência lê embeddings Neo4j **sem** `order_date` na query de perfil (`getClientPurchasedEmbeddings`), logo não pode calcular \(\Delta_i\) sem evolução de contrato.

## Decision

Introduzir um **módulo único** (ex.: `src/profile/clientProfileAggregation.ts`) que exporta **`aggregateClientProfileEmbeddings`** com modos `mean` e `exp` (meia-vida \(H\) → \(\tau = H/\ln 2\), pesos \(w_i=\exp(-\Delta_i/\tau)\), vector normalizado \(\mathbf p = \sum w_i \mathbf e_i / \sum w_i\)). **Treino:** construir por cliente a lista `(productId → t_i ISO, T_ref^(c))` a partir do **snapshot de `orders`** já obtido em `fetchTrainingData`, com \(T_{\mathrm{ref}}^{\,(c)}=\max\) das datas normalizadas (`normalizeOrderDateFromApi`) desse cliente no snapshot; mapear embeddings via `productEmbeddingMap`. **Inferência:** novo método Neo4j (ou extensão documentada) que devolve **por produto** `embedding` e `lastPurchase` (mesma semântica M16/P1: `BOUGHT` confirmado, `order_date` não nulo, `embedding` não nulo); \(T_{\mathrm{ref}}\) = instante da requisição (UTC). **`recommendFromCart`:** construir uma única lista de entradas = histórico confirmado com \(\Delta_i\) reais **união** itens do carrinho com \(\Delta=0\), passar **uma** vez por `aggregateClientProfileEmbeddings`. **`rankingEval.computePrecisionAtK`:** importar a mesma função para o perfil de holdout, evitando terceira cópia. Variáveis `PROFILE_POOLING_MODE` e `PROFILE_POOLING_HALF_LIFE_DAYS` validadas no arranque como no spec (PRS-25).

## Alternatives considered

- **Pooling só em inferência, treino mantém média:** descartado — viola PRS-12 e invalida métricas offline; o gradiente não reflecte o sinal de recência no perfil.
- **Weighted sum apenas em Cypher no Neo4j:** descartado — o treino não executa o mesmo Cypher sobre o snapshot da API; duplicaria semântica e quebraria a regra de **uma** função TypeScript partilhada.
- **Contrato temporal só em Neo4j para treino:** descartado — `buildTrainingDataset` não tem sessão Neo4j; o pipeline actual já materializa compras via `orders` em memória antes do fit.

## Consequences

- **Trade-off aceite:** maior superfície de refactor (`ModelTrainer`, `training-utils`, `RecommendationService`, `rankingEval`, `env.ts`, `Neo4jRepository`, testes) em troca de garantia PRS-11/12.
- **Risco residual:** desfasamento eventual entre snapshot `orders` e Neo4j em runtime após sync falhar — já documentado no spec; mitigação: manter `syncNeo4j` como passo habitual e logar `syncedAt`.
- **Escalabilidade:** clientes com histórico muito grande fazem agregação \(O(N \cdot d)\) em CPU antes de `tf.tidy`; aceitável para o volume demo; monitorizar se o produto crescer.
- **Extensão opcional:** `rankingConfig` pode incluir `profilePoolingMode` e `profilePoolingHalfLifeDays` (PRS-29) sem obrigar mudança de UI na primeira entrega P2.

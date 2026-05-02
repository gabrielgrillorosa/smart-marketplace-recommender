# ADR-071: M21 — cabeça neural sob pairwise e fronteira de fusão pura

**Status:** Accepted  
**Date:** 2026-05-01  
**Relacionado:** [ADR-070](./adr-070-m21-committee-priorities-and-m17-p3-deferral.md), [spec M21](./spec.md)

## Context

O modo **pairwise** (T1) pode exigir saída **logit** na última camada densa (sem `sigmoid` na grafo) para estabilidade da loss, enquanto o legado **BCE** usa `binaryCrossentropy` com última camada **sigmoid**. Artefactos `SavedModel` antigos não são intercambiáveis se a forma ou activação da cabeça mudarem. Em paralelo, **R** e **T4** são heurísticas de inferência que devem permanecer **testáveis sem Neo4j nem TF** e **fora** do MLP, para não misturar treino com política de fusão.

## Decision

1. **Cabeça neural:** `buildNeuralModel` / factory passa a ser parametrizada por **perfil de loss** (`bce` → última camada `sigmoid` como hoje; `pairwise` / ramos relacionados → última camada **linear**; inferência aplica **mesma** nonlinearity documentada que o path de treino usa para produzir escalar comparável ao híbrido — ver matriz em [design.md](./design.md)).
2. **Compatibilidade:** carregamento falha com erro **explícito** se metadata do artefacto (ex. campo no manifest ou nome de perfil serializado) não coincidir com o modo activo; operador faz rollback via env + modelo anterior ([spec](./spec.md) edge case).
3. **Fusão R/T4:** lógica de **pesos efectivos dinâmicos** e **temperatura** implementada como **funções puras** num módulo dedicado (ex. `src/ml/hybridScoreCalibration.ts` ou nome final na primeira tarefa), chamadas a partir de `RecommendationService` **depois** de obter `neuralScore` bruto e **antes** de `computeFinalScore` / breakdown, sem novos tensores TF para R/T4.

## Alternatives considered

- **Manter sempre sigmoid na grafo e pairwise só via BCE aproximado:** descartado — não cumpre intenção do comité (optimização explícita de ordenação).
- **Embutir heurísticas R/T4 dentro do `tf.tidy()`:** descartado — dificulta testes, aumenta superfície TF ([CONCERNS](../../codebase/ai-service/CONCERNS.md) C-A01), viola M21-10.
- **Registry plugável de estratégias para cada track:** descartado neste milestone — viola Rule of Three para o tamanho actual do código; reavaliar se um quarto modo de fusão surgir.

## Consequences

- Treinos pairwise produzem artefactos **marcados**; documentação operador obriga checklist de promoção + `precisionAt5`.
- `RecommendationService` pode crescer menos se pesos/temperatura forem delegados a helpers puros com testes Vitest dedicados.
- Risco residual: duplicação conceptual entre “score mostrado” e “score para sorting” — mitigado documentando ordem: neural raw → temperatura → pesos dinâmicos → combinação híbrida → recency (`rankScore`).

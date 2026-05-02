# ADR-066: Métrica de Δscore no showcase (PE-04 / M19)

**Status:** Accepted  
**Date:** 2026-05-01  
**Relacionado:** [ADR-065](./adr-065-post-checkout-column-deltas-baseline.md), [spec M19 § PE-04](./spec.md)

## Context

Com **M17**, a lista visível pode ordenar por `rankScore` (re-rank com recência), enquanto [`buildRecommendationDeltaMap`](../../../frontend/lib/showcase/deltas.ts) comparava apenas `finalScore`. O utilizador pode ler o número na pill como «variação do que ordena a lista» e ver inconsistência.

## Decision

**Opção B (aceite em M19):** em `buildRecommendationDeltaMap`, usar **`rankScore ?? finalScore`** para comparações de score e para `scoreDelta` em cada `RecommendationResult` quando `rankScore` existe no payload; caso contrário usar só `finalScore` (equivalente à opção A).

## Alternatives considered

- **Só `finalScore` (opção A do spec):** mais simples e alinhado ao «score neural bruto»; rejeitado como padrão do showcase porque falha na expectativa de paridade com a ordem da grelha quando M17 está activo.
- **Duas pills (rank + neural):** clareza máxima; **rejeitado** no âmbito M19 — ADR-065 proíbe duplicar UI de deltas.

## Consequences

- **Positivas:** Δ numérico alinha-se à narrativa visual da coluna quando `rankScore` está presente.
- **Negativas:** testes e fixtures devem cobrir ambos os campos; documentação da pill continua a descrever «variação de score» coerente com a ordenação quando M17 está activo.
- **Se produto revertesse para opção A:** implementação limitar-se-ia a usar só `finalScore` nos dois lados — sem selector adicional.

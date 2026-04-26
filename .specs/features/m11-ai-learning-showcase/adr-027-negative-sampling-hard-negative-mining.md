# ADR-027: Negative Sampling Balanceado com Hard Negative Mining por Categoria

**Status**: Accepted
**Date**: 2026-04-26

## Context

O `ModelTrainer` atual usa todos os produtos como candidatos negativos para cada cliente — gerando ~5.5 negativos por positivo com o dataset sintético (20 clientes, 52 produtos). Esse desbalanceamento faz a rede aprender que "não comprado" é a resposta segura, resultando em `neuralScore` próximo de 0 para quase todos os produtos independente da categoria. Compras demo de beverages não conseguem subir no ranking após retreino porque o dataset de treino continua dominado por negativos de beverages.

O Prof. Dr. em Engenharia de IA com foco em Recomendações identificou (High severity) que o negative sampling uniforme mantém produtos da mesma categoria nos negativos, diluindo o gradiente de aprendizado por categoria. O Arquiteto de Soluções identificou (Medium severity) que sampling não-determinístico compromete reproducibilidade da demo.

## Decision

Implementar negative sampling com razão 1:4 (positivos:negativos) e **hard negative mining por categoria**: para cada positivo da categoria X, pelo menos 2 dos 4 negativos devem ser de categorias diferentes de X. A seleção usa seed determinístico derivado do `clientId` hash para reproducibilidade entre retreinamentos com os mesmos dados.

## Alternatives considered

- **Todos os produtos como negativos (atual)** — razão 1:5.5, mesma categoria inclusa nos negativos; a rede não aprende a discriminar por categoria; beverages nunca sobe após demo de beverages.
- **Negative sampling uniforme N=4 sem mining por categoria** — melhora o balanço mas não resolve o gradiente diluído para a categoria específica do positivo; Prof. IA/Rec rejeitou por não ser suficiente para sinal de categoria visível.
- **Upsampling dos positivos (duplicar M vezes)** — equivalente a `classWeight` mas mais simples de implementar; descartado em favor de hard negative mining pois não melhora a separação de categorias.

## Consequences

- Dataset reduz de ~1040 para ~640 amostras com N=4 — Prof. DL recomenda aumentar EPOCHS para 30 ou reduzir BATCH_SIZE para 16 para compensar (incorporado em ADR-028).
- Hard negative mining requer `Map<productId, category>` em memória — custo O(n) com n=52 produtos, negligível.
- Seed derivado de `clientId` garante que o mesmo cliente gera os mesmos negativos em cada retreinamento com os mesmos dados — demo comparável antes/depois.
- `precisionAt5` atual de 0.95 pode variar com o novo sampling — aceitável pois o valor atual pode ser artifact de overfitting (ADR-028).

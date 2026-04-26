# ADR-028: Arquitetura de Rede Reduzida + classWeight para Desbalanceamento Residual

**Status**: Accepted
**Date**: 2026-04-26

## Context

A arquitetura atual `Dense[256, relu] → Dropout[0.3] → Dense[128, relu] → Dropout[0.2] → Dense[64, relu] → Dense[1, sigmoid]` tem ~65k parâmetros treináveis para ~1040 amostras (razão ~60:1). O Prof. Dr. em Deep Learning identificou (High severity) que a regra empírica para generalização exige razão < 10:1 — indicando que o modelo está em regime de overfitting severo. O `precisionAt5=0.95` é parcialmente artifact de memorização do dataset, não de generalização real.

Adicionalmente, mesmo com negative sampling N=4, o dataset ainda tem razão 1:4 positivos:negativos (20%). Sem compensação, a rede minimiza loss global priorizando a classe majoritária (0) — `neuralScore` continua próximo de 0 para a maioria dos produtos.

## Decision

Reduzir arquitetura para `Dense[64, relu, l2(1e-4)] → Dropout[0.2] → Dense[1, sigmoid]` (~25k parâmetros para ~640 amostras → razão ~39:1, ainda alto mas viável com regularização L2). Passar `classWeight: {0: 1.0, 1: 4.0}` no `model.fit()` para compensar o desbalanceamento residual 1:4. Aumentar `EPOCHS` para 30 e reduzir `BATCH_SIZE` para 16 para compensar o dataset menor gerado pelo negative sampling.

## Alternatives considered

- **Arquitetura atual Dense[256→128→64→1]** — ~65k parâmetros, ratio 60:1, overfitting garantido; Prof. DL rejeitou (High severity).
- **Dense[128→64→1]** — ~32k parâmetros, ratio ~50:1 — ainda alto; margem de melhora insuficiente.
- **Dense[32→1]** — ~12k parâmetros, ratio ~19:1 — pode ser underfit com 640 amostras; descartado por Staff Engineering como risco de underfitting.
- **`loss: 'focalLoss'`** — alternativa ao `classWeight` para desbalanceamento; não disponível nativamente no TensorFlow.js sem implementação custom; descartado por complexidade.

## Consequences

- Rede menor converge mais rápido (menos epochs necessários por step) e generaliza melhor com dataset pequeno.
- `classWeight` força gradientes maiores nos positivos — compras demo de beverages terão gradiente 4× maior do que negativos; o sinal de categoria será aprendido explicitamente.
- `precisionAt5` pode reduzir de 0.95 para 0.80-0.85 — considerado saudável pois o valor anterior era inflado por overfitting. O objetivo demo é que beverages suba visivelmente após compras demo, não maximizar `precisionAt5` em dataset sintético.
- `EPOCHS=30, BATCH_SIZE=16` aumenta tempo de treino de ~9s para ~12-15s — aceitável para a demo.
- L2 regularization `1e-4` é padrão conservador; pode ser exposto como env var `NEURAL_L2_REG` para ajuste futuro.

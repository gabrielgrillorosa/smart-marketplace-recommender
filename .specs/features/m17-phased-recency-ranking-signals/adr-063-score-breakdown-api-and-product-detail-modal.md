# ADR-063: Decomposição de score (híbrido + recência) na API e no modal de detalhe do produto

- **Data**: 2026-05-01
- **Estado**: Accepted
- **Etiquetas**: recsys, frontend, ai-service, observabilidade, M17

## Contexto e problema

Com **M17 P1** activo (`RECENCY_RERANK_WEIGHT > 0`), a ordenação dos elegíveis segue `rankScore = finalScore + w_r × recencySimilarity`, enquanto `finalScore` permanece apenas `NEURAL_WEIGHT × neural + SEMANTIC_WEIGHT × semantic` ([ADR-016](../m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md), [ADR-062](./adr-062-phased-recency-ranking-signals.md)).

O **modal de detalhe do produto** (“RESUMO DO SCORE ATUAL”) mostra hoje `finalScore` em percentagem e os brutos `neuralScore` / `semanticScore`, **sem**:

1. parcelas **em pontos** da rede e do semântico no híbrido (depende dos pesos `NEURAL_WEIGHT` / `SEMANTIC_WEIGHT` no `ai-service`);
2. `recencySimilarity`, **incremento** `rankScore − finalScore`, nem `rankScore` como chave de ordenação;
3. garantia de que o **peso** `w_r` visível no UI coincide com o do servidor (evitar duplicar só no `.env` do frontend).

Operadores e avaliadores precisam de **transparência** para calibrar `w_r` e diagnosticar se a rede vs. semântico vs. recência está a dominar indevidamente.

## Impulsores da decisão

- **Rastreio**: alinhar o que o utilizador vê ao contrato M17 e às variáveis de ambiente efectivas.
- **Sem deriva**: não inferir `w_r` só por `(rankScore − finalScore) / recencySimilarity` como única fonte de verdade (arredondamentos e casos `recencySimilarity = 0`).
- **Compatibilidade**: clientes que ignoram campos novos continuam válidos ([spec M17](./spec.md)).
- **Manutenção**: uma única fonte de verdade para pesos em runtime.

## Opções consideradas

1. **A — Metadados de ranking na resposta `POST /recommend` (recomendado)**  
   Incluir um objecto opcional por resposta (ex. `rankingConfig: { neuralWeight, semanticWeight, recencyRerankWeight }`) e, por item, manter/estender `finalScore`, `neuralScore`, `semanticScore`, `recencySimilarity`, `rankScore`. O frontend calcula ou mostra parcelas `w_n×neural`, `w_s×semantic`, `w_r×recencySimilarity` e o incremento de ordenação.

2. **B — Pesos só no frontend (`NEXT_PUBLIC_*`)**  
   Duplicar pesos no Next.js. Rápido mas **desalinhado** se o `ai-service` mudar sem redeploy coordenado do frontend.

3. **C — UI mínima sem pesos no payload**  
   Mostrar só `recencySimilarity` e `rankScore − finalScore` quando `rankScore` existir; não mostrar contribuição neural/semântica em pontos sem inferência ou sem pesos.

## Decisão

**Opção A (aceite como direcção).**

- O **`ai-service`** passa a expor, na serialização HTTP da recomendação (mesmo envelope que já transporta itens), **metadados de configuração de ranking** efectivos em runtime (`neuralWeight`, `semanticWeight`, `recencyRerankWeight` quando aplicável).
- Cada item elegível continua a expor `finalScore`, `neuralScore`, `semanticScore`; com M17 activo, também **`recencySimilarity`** e **`rankScore`** (já previstos no contrato; garantir presença no fluxo até ao modal).
- O **frontend** (`CatalogPanel` → `scoreMap` → `ProductDetailModal`) **propaga** `recencySimilarity` e `rankScore` e renderiza um resumo que separa:
  - **Contribuição ao híbrido** (em pontos): `neuralWeight × neuralScore`, `semanticWeight × semanticScore` (valores vindos do payload de config ou pré-calculados no servidor — ver implementação);
  - **Recência**: `recencySimilarity`, incremento `rankScore − finalScore`, e opcionalmente `rankScore` explícito para “ordem efectiva”.

**Pré-cálculo no servidor (preferência na implementação):** opcionalmente incluir por item campos derivados só para UI (`hybridNeuralTerm`, `hybridSemanticTerm`, `recencyBoostTerm`) para evitar duplicar a fórmula `computeFinalScore` no cliente; isso fica como detalhe de implementação desde que a fonte de verdade dos pesos seja o `ai-service`.

## Consequências

### Positivas

- Calibração de `RECENCY_RERANK_WEIGHT` com **feedback visual** coerente com o backend.
- Menos ambiguidade entre “Score final %” e ordem na grelha quando `rankScore ≠ finalScore`.
- Documentação e E2E podem asserir rótulos (`product-detail-score-summary`).

### Negativas

- **Payload ligeiramente maior** (objecto de config + possivelmente campos derivados por item).
- **Dois sítios a versionar** se no futuro a fórmula mudar: serialização + UI (mitigado por testes de contrato ou campos pré-calculados só no servidor).

## Prós e contras das opções (resumo)

| Opção | Pró | Contra |
|--------|-----|--------|
| **A** | Alinhamento runtime; uma fonte de verdade para pesos | Mais trabalho API + proxy + adaptador |
| **B** | Implementação rápida no modal | Drift entre serviços |
| **C** | Menos mudanças | Não satisfaz “exactamente o que cada um contribui” no híbrido |

## Ligações

- [ADR-016](../m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md) — definição de `finalScore`.
- [ADR-062](./adr-062-phased-recency-ranking-signals.md) — `rankScore` e `recencySimilarity`.
- [design M17](./design.md) / [spec M17](./spec.md) — exposição opcional de campos na API; **PRS-16–PRS-22** (decomposição ADR-063) na especificação.
- Levantamento de alteração de código (modal + `scoreMap` + contrato): conversa interna de produto / tarefa de implementação associada a esta ADR.

## Nota de implementação

Implementação **P1 + ADR-063/064** verificada (`ai-service` + `frontend`, 2026-05-01). Estado do ADR: **Accepted**. Rastreio: [tasks.md](./tasks.md) (T1–T11 concluídas). **Pendentes M17:** só [Fase 2 / Fase 3](./spec.md) do ADR-062.

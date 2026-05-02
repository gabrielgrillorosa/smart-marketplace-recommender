# ADR-062: Rollout em fases de sinais de recência no ranking (boost, perfil ponderado, atenção)

**Status**: Accepted  
**Date**: 2026-04-30  
**Authors**: Comitê Técnico (Eng. IA aplicada / RecSys · Deep Learning · Arquiteto de Soluções)  
**Feature:** [M17](./spec.md) — documento co-localizado com `spec` e `design` da mesma entrega.

**Estado de implementação (2026-05-01):** **Fase 1 (P1)** + transparência [ADR-063](./adr-063-score-breakdown-api-and-product-detail-modal.md)/[064](./adr-064-rankingconfig-zustand-recommendation-slice.md) **entregues**. **Pendentes neste ADR:** **Fase 2** (pooling) e **Fase 3** (atenção) — [tasks](./tasks.md) P1+ADR concluídas; seguir [spec](./spec.md) PRS-11–15.

---

## Context and Problem Statement

O pipeline híbrido (`ModelTrainer` + `RecommendationService`) usa **perfil de cliente = média aritmética** dos embeddings de produtos comprados e combina **neural + semântico** (ver [ADR-016](../m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md)). Isso trata compras recentes e antigas com o **mesmo peso**, o que não reproduz comportamentos de sessão do tipo “semelhante ao que acabei de ver” (ex.: YouTube).

Foram avaliadas três linhas de melhoria: (1) **boost de similaridade** ao(s) último(s) item(ns) comprado(s) no re-ranking; (2) **histórico ponderado** (ex. decaimento exponencial) na construção do vetor de perfil, com impacto no treino; (3) **atenção** sobre a sequência temporal de pedidos.

Surge a dúvida de política de implementação: **ativar as três de uma vez**, **uma única variável de ambiente mutuamente exclusiva**, ou **faseamento com flags ortogonais**.

---

## Decision Drivers

- Mensurabilidade: poder atribuir ganhos/regressões a **uma mudança de cada vez** (`precisionAt5`, validação temporal quando existir).
- Risco de produto: evitar **duplicação de sinal** (ex.: perfil já “puxado” para o recente + boost forte + atenção empilhando o mesmo efeito sem controlo).
- Custo de engenharia: **atenção** implica arquitetura de modelo e contrato de dados distintos do MLP atual sobre vetor `[768]`.
- Operabilidade: permitir **ligar/desligar** e calibrar em produção ou staging sem novo deploy quando possível.

---

## Considered Options

1. **Implementar as três em conjunto num único release** — máximo sinal de recência de imediato.
2. **Um único `MODE=A|B|C`** escolhendo exclusivamente uma das três abordagens.
3. **Faseamento com flags ortogonais** (variáveis de ambiente separadas), **sem** ativar tudo de uma vez na primeira entrega; atenção como **trabalho de maior porte** condicionado a volume de dados.

---

## Decision Outcome

**Opção 3 — aceite.**

### Ordem de entrega recomendada


| Fase  | Sinal                                                       | Notas                                                                                                                                              |
| ----- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Boost de similaridade (re-ranking)                          | Prioridade alta; pode ser `0` para desligar; **não exige** retreino do MLP para existir valor.                                                     |
| **2** | Perfil ponderado no pooling (treino + inferência alinhados) | Exige **retreino** e mesma fórmula na recomendação; comparar métricas offline.                                                                     |
| **3** | Atenção sobre sequência de pedidos                          | **Roadmap** condicionado a densidade de eventos por cliente; tratado como **evolução de modelo**, não como terceiro “toggle” equivalente ao boost. |


### Política de configuração

- **Não** adotar um único enum que force “só uma das três” para sempre: prevê-se combinação útil **fase 1 + fase 2** com pesos calibrados.
- **Sim** a variáveis de ambiente **ortogonais** (ex.: peso/intensidade do boost; `mean` vs `exponential` / half-life para perfil; flag separada só quando existir caminho de modelo com atenção treinado e serializado).

### Política de release

- **Não** ligar as três simultaneamente na **primeira** onda sem baseline de métrica por componente.
- Documentar supersession desta política num ADR futuro se a evidência empírica justificar fusão ou simplificação.

---

## Positive Consequences

- Experimentação clara e rollback fino por componente.
- Boost rápido de valor de produto (“sessão”) sem bloquear em retreino.
- Perfil ponderado alinha o **gradiente do treino** à recência sem confundir com heurística só no ranking.

---

## Negative Consequences

- Superfície de configuração maior (mais env vars e testes).
- Fase 2 exige **disciplina**: inferência e `buildTrainingDataset` devem usar a **mesma** definição de perfil.
- Fase 3 aumenta custo de manutenção e dados ordenados; risco de overfitting com poucos pedidos por utilizador.

---

## Pros and Cons of the Options

### Faseamento + flags ortogonais (escolhido)

- ✅ Atribuição de métrica e rollback simples.
- ✅ Permite combinar boost + pooling ponderado quando estiverem estáveis.
- ❌ Mais parâmetros para operar e documentar.

### Três de uma vez

- ✅ Um único “big bang” de UX.
- ❌ Difícil diagnosticar regressões; risco de sinal redundante.

### Enum exclusivo `MODE=1|2|3`

- ✅ Matriz de teste menor no MVP.
- ❌ Escala mal quando se quiser “pooling ponderado + boost”; força refatoração do contrato de config.

---

## Links

- [ADR-016](../m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md) — score híbrido neural/semântico.
- [ADR-060](../m16-neural-first-didactic-ranking-catalog-density/adr-060-recent-suppression-neo4j-order-date.md) — supressão de recomendação por compra recente (complementar: evita repetir SKU; não substitui boost a similares).
- Código de referência: `ai-service/src/services/training-utils.ts` (perfil para treino), `RecommendationService.ts` (ranking híbrido).


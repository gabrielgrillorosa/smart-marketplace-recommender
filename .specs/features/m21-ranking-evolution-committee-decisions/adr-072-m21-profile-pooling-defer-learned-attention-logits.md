# ADR-072: Adiar logits aprendidos no pooling de perfil (`attention_light`) até pipeline e artefacto versionados

- **Data**: 2026-05-01
- **Estado**: Aceite
- **Decisores**: Comité informal (Eng. IA aplicada a recomendação, Deep Learning / recomendação, Arquitectura de soluções de IA) sobre proposta de extensão com `AttentionParams` (`w`, `b`, `λ`) nos logits antes do softmax.
- **Etiquetas**: M21, profile-pooling, attention_light, ADR-065, ADR-070

## Contexto e problema

A implementação **M21 Track A** entrega `attention_light` como **função pura em TypeScript**: softmax sobre logits \(-\Delta/\tau\) (e opcionalmente temperatura \(T\) e janela `N`), partilhada entre treino, inferência, carrinho e `precisionAt5` ([ADR-065](../m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md), [ADR-070](./adr-070-m21-committee-priorities-and-m17-p3-deferral.md)).

Foi proposta uma evolução: **logits** da forma \(w \cdot e + b - \lambda \Delta/\tau\) (pesos lineares aprendidos sobre o embedding de cada compra + termo temporal), mantendo agregação em TS “leve” em inferência.

**Forças em jogo:** (1) ADR-065 exige **um só módulo** e **treino = inferência** para o vector de perfil. (2) Parâmetros aprendidos exigem **origem, regularização, serialização** e **compatibilidade** com `VersionedModelStore` / rollback. (3) Aprendizagem **joint** com o MLP implica gradiente através do softmax e listas variáveis de compras — custo de engenharia e risco numérico **superiores** ao benefício sem validação offline. (4) Risco de **overfitting** com históricos curtos por cliente se \(w,b\) forem globais sem critérios de dados.

## Impulsionadores da decisão

- Preservar **simplicidade operacional** e **regressão mensurável** (M21-06) do pooling actual.
- Não expandir o **superfície TF.js** nem o grafo de treino sem critério de valor (métricas, baseline).
- Manter **rastreabilidade**: qualquer extensão aprendida deve ser **artefacto versionado**, não só env.

## Opções consideradas

- **A — Implementar já** `attentionParams` aprendidos no mesmo PR/ciclo que M21 A.  
- **B — Adiar** até existir ADR/filho + pipeline (offline ou joint) + persistência + testes de regressão.  
- **C — Não fazer** aprendizagem no pooling; ficar só em `mean` / `exp` / `attention_light` fixo.

## Resultado da decisão

**Opção B (Adiar)** — **Aceite**.

O comportamento **em produção** permanece: **`attention_light` sem logits aprendidos** (`w`, `b`, `λ`). A proposta de **logit \(w \cdot e + b - \lambda \Delta/\tau\)** fica **registada como evolução candidata**, sujeita a:

1. **RFC ou ADR filho** com: formato do artefacto, bounds (`L2`, clamp de logits), semântica exacta de temperatura (evitar dupla divisão por \(T\)), fallback quando o artefacto falta.  
2. **Fase 1 recomendada**: \(w,b,\lambda\) aprendidos **offline** (ou servidos como config versionada), **validação offline** no mesmo protocolo que `precisionAt5`, **sem** joint training até haver ganho demonstrado.  
3. **Fase 2 opcional**: end-to-end com o MLP **só** se a Fase 1 justificar e a equipa aceitar o custo de grafo / testes.

**Não** se adopta a **Opção A** neste momento.

### Consequências positivas

- Mantém-se o **contrato ADR-065** e o **comité QA** (anti-drift) sem novos caminhos não versionados.  
- Evita bloquear entregas M21 já planeadas por complexidade de treino conjunto.

### Consequências negativas / trade-offs

- O ganho potencial de **relevância semântica** no pooling (via \(w \cdot e\)) **não** fica disponível até trabalho adicional.  
- Quem quiser explorar a ideia deve abrir **tarefa/RFC explícita** e actualizar o [design M21](./design.md) / [tasks](./tasks.md) em vez de estender `aggregateClientProfileEmbeddings` ad hoc.

## Prós e contras (resumo)

### B — Adiar (escolhida)

- Alinha com **governança** e **baseline** primeiro.  
- Custo: **latência** na capacidade “learned”.

### A — Implementar já

- Pro: inovação mais cedo.  
- Contra: alto risco de **incompatibilidade de artefacto**, **testes insuficientes** e **pressão** sobre o `ModelTrainer` / TF sem desenho fechado.

### C — Nunca aprender no pooling

- Pro: máxima simplicidade.  
- Contra: descarta uma família de melhorias sem prova empírica; por isso **não** foi escolhida; mantém-se **candidata** sob B.

## Ligações

- [ADR-065](../m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md) — pooling partilhado.  
- [ADR-070](./adr-070-m21-committee-priorities-and-m17-p3-deferral.md) — ordem M21 / M17 P3.  
- [ADR-071](./adr-071-m21-neural-head-and-pure-fusion-boundary.md) — fronteira cabeça neural / fusão (contexto separado do pooling).  
- [design M21](./design.md), [spec M21](./spec.md), [tasks M21](./tasks.md).

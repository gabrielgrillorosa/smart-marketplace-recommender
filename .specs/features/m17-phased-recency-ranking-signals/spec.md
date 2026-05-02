# M17 — Phased recency ranking signals (`ai-service`) — Especificação

**Status:** **M17 P1 + P2 + ADR-063/064** implementados no `ai-service` (2026-05-01). **P3** — não priorizado neste marco.

**Roadmap:** [.specs/project/ROADMAP.md](../../project/ROADMAP.md) — **M17**.

---

## Source documents

- [ADR-062](./adr-062-phased-recency-ranking-signals.md) — *Accepted*: faseamento, flags ortogonais, sem enum exclusivo `MODE`.
- [ADR-063](./adr-063-score-breakdown-api-and-product-detail-modal.md) — *Accepted*: decomposição de score (híbrido + recência) na API e no modal; **Opção A** (metadados no payload + UI).
- [ADR-064](./adr-064-rankingconfig-zustand-recommendation-slice.md) — *Accepted* (pós design-complex-ui): `rankingConfig` no `recommendationSlice` Zustand, limpeza atómica com recomendações.
- [ADR-065](./adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md) — *Accepted*: agregação partilhada de perfil + alinhamento temporal treino/inferência (M17 P2).
- [ADR-016](../m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md) — *Proposed*: calibração híbrida (seguimento após baselines por fase).
- [ADR-060](../m16-neural-first-didactic-ranking-catalog-density/adr-060-recent-suppression-neo4j-order-date.md) — supressão por compra recente (complementar ao boost: não substitui o sinal de similaridade).

---

## Problema

O perfil do cliente continua sendo agregado com o mesmo peso para compras antigas e recentes ([ADR-062](./adr-062-phased-recency-ranking-signals.md)). Isso atrasa valor de produto no estilo “parecido com o que acabei de comprar” sem esperar retreino ou mudança de arquitetura do MLP. Em paralelo, **não** se quer empilhar boost, pooling ponderado e atenção no mesmo release sem atribuição de métrica.

## Goals

- [x] **Fase 1 (P1):** Introduzir boost de similaridade a âncora(s) de compra recente **após** o cálculo do score híbrido, calibrável por env e **desligável** com peso `0` (sem retreino obrigatório). *(Implementado `ai-service`; ver [tasks.md](./tasks.md) T1–T6.)*
- [x] Preservar a definição didática de **`finalScore`** do [M16](../m16-neural-first-didactic-ranking-catalog-density/spec.md) como combinação exclusiva de `neuralScore` e `semanticScore`.
- [x] Expor ordenação de forma **auditável** (campo(s) opcional(is) ou documentação clara de como a ordem diverge de `finalScore` puro).
- [x] **ADR-063:** Operadores veem no showcase a mesma decomposição que o `ai-service` (`rankingConfig`, modal, proxy, store). *Débito opcional:* teste unit Vitest do adapter ([CONCERNS C-F02](../../codebase/frontend/CONCERNS.md)).
- [x] **Fase 2 (P2):** Alinhar pooling do perfil entre `buildTrainingDataset` e inferência, com flag/peso dedicados e ciclo de retreino — requisitos rastreáveis **PRS-11–13** e **PRS-23–28** neste documento.
- [ ] **Fase 3 (P3):** Tratar atenção temporal como evolução de modelo, fora do escopo de “toggle trivial” da fase 1.

## Fora de Escopo (Fase 1 / P1)

| Feature | Motivo |
|--------|--------|
| Retreino do MLP ou mudança de formato do tensor de entrada só para Fase 1 | ADR-062: valor inicial sem retreino |
| Pooling exponencial / meia-vida no perfil (treino + inferência) | Fase 2 — exige alinhamento e retreino |
| Modelo com atenção sobre sequência de pedidos | Fase 3 — contrato e artefacto distintos |
| Enum único mutuamente exclusivo `MODE` com modos A/B/C em exclusão mútua para sempre | Rejeitado no ADR-062; usar envs ortogonais |
| Ativar Fase 2 e Fase 3 no mesmo release “big bang” sem baselines por componente | Política ADR-062 |
| Alterar a regra de supressão `RECENT_PURCHASE_WINDOW_DAYS` (M16) | Complementar; não substituída pelo boost |
| Usar **apenas** `NEXT_PUBLIC_*` no frontend como fonte primária de `NEURAL_WEIGHT` / `SEMANTIC_WEIGHT` / `RECENCY_RERANK_WEIGHT` em detrimento do payload | Rejeitado no ADR-063 (deriva deploy); ver PRS-19 |

## Fora de Escopo (P2 — Fase 2)

| Item | Motivo |
|------|--------|
| Modelo com **atenção** sobre sequência (transformer) | Fase 3 — contrato e artefacto distintos ([ADR-062](./adr-062-phased-recency-ranking-signals.md)) |
| Alterar dimensão do tensor de entrada do MLP (≠ 768) | Mantém arquitectura actual `productEmb ∥ clientProfile` |
| Mudar definição de `finalScore` ou de `rankScore` / boost P1 | P2 só altera **construção do vector de perfil**; P1 permanece ortogonal |
| **Split temporal leccionado** por exemplo (leave-last-order-out por amostra) | Melhoria futura; P2 limita-se a **mesma** família de amostras que hoje, com agregação de perfil mais fiel à recência |
| Obrigar alteração de UI além de **opcional** extensão de `rankingConfig` / README | Transparência P2 é *nice*; núcleo é `ai-service` + treino |

---

## User Stories

### P1: Boost de recência no re-ranking (âncora = compra recente confirmada) ⭐ MVP (Fase 1)

**User Story:** Como operador do `ai-service`, quero ajustar um peso ortogonal que reordena candidatos **elegíveis** em função da similaridade aos embeddings dos produtos comprados recentemente, para aproximar o ranking de “sessão” sem retreinar o MLP e com rollback imediato (peso `0`).

**Por que P1:** É a primeira entrega do [ADR-062](./adr-062-phased-recency-ranking-signals.md): maior prioridade, mensurável isoladamente, sem dependência de `ModelTrainer`.

**Estado de implementação:** **Entregue no `ai-service`** (tarefas **T1–T6** concluídas; rastreio PRS-01–10 **verificado** — ver [tasks.md](./tasks.md)).

**Acceptance Criteria:**

1. WHEN o serviço calcula `neuralScore` e `semanticScore` para um candidato elegível THEN o sistema SHALL calcular `finalScore` exclusivamente como `NEURAL_WEIGHT * neuralScore + SEMANTIC_WEIGHT * semanticScore` (inalterado face ao M16).
2. WHEN a variável de ambiente de peso do boost de recência (nome canónico definido em `design`/implementação, e.g. `RECENCY_RERANK_WEIGHT`) for `0` ou ausente com default documentado `0` THEN a ordem dos elegíveis no ranking principal SHALL coincidir com a ordenação estrita por `finalScore` descendente atual.
3. WHEN o peso for `> 0` THEN o sistema SHALL derivar um ou mais vetores âncora a partir do histórico de compras **confirmadas** do cliente (mesma fonte de verdade que supressão M16), limitado aos últimos `N` produtos comprados com embedding válido, com `N` configurável e default `1` (última compra com embedding).
4. WHEN existir pelo menos uma âncora THEN, para cada candidato elegível com embedding, o sistema SHALL calcular um sinal de similaridade cosseno entre o embedding do candidato e cada âncora e SHALL agregar esse sinal de forma documentada (default proposto: **máximo** dos cossenos às âncoras, para interpretabilidade “parecido a algum dos últimos itens”).
5. WHEN o peso for `> 0` THEN a ordenação dos elegíveis SHALL usar uma chave de ranking documentada que combina `finalScore` e o termo de recência (ex.: `rankScore = finalScore + weight * recencySimilarity`); o sistema SHALL NOT incorporar o boost dentro da expressão aritmética de `finalScore`.
6. WHEN não existir âncora utilizável (sem compras com embedding, ou falha parcial recuperável) THEN o boost SHALL degradar de forma segura: similaridade de recência tratada como `0` para todos, preservando ordem por `finalScore` apenas.
7. WHEN um produto estiver inelegível (incl. `recently_purchased` na janela M16) THEN ele SHALL permanecer fora do conjunto pontuado pelo MLP para ranking; o boost de Fase 1 SHALL aplicar-se apenas ao conjunto já elegível para neural/semântico.
8. WHEN `recommend`, `recommendFromCart` (ou fluxos que reutilizem o mesmo caminho de ranking) forem executados com boost ativo THEN o comportamento SHALL ser consistente entre eles relativamente à definição de âncora e à fórmula de `rankScore` (diferenças só pelos dados de perfil/carrinho já existentes).
9. WHEN o boost estiver ativo THEN a resposta da API SHOULD expor campos numéricos opcionais para transparência (ex.: `recencySimilarity`, `rankScore`) sem remover `finalScore`/`neuralScore`/`semanticScore`; se a exposição for adiada por compatibilidade, o comportamento de ordenação SHALL estar documentado em `design.md` ou README do serviço até expor.
10. WHEN o peso for configurado com valor inválido (negativo, `NaN`) THEN o serviço SHALL falhar de arranque com mensagem clara **ou** SHALL aplicar política documentada de clamp (preferência: falha de arranque para evitar ranking silenciosamente errado).

**Independent Test:** Subir `ai-service` com peso `0` e registar ordem dos top-K; repetir com peso `> 0` e mesmo seed/cliente com compras recentes — verificar que `finalScore` por SKU é idêntico entre os dois modos e que apenas a ordem (e metadados de recência, se expostos) muda de acordo com a similaridade à âncora.

---

### P1 (ADR-063): Transparência de score na API e no modal de detalhe do produto

**User Story:** Como operador ou avaliador, quero que o resumo “RESUMO DO SCORE ATUAL” no modal de produto mostre **exactamente** as parcelas do híbrido (`w_n × neural`, `w_s × semantic`), o sinal de recência e o incremento de ordenação, com pesos **iguais** aos do `ai-service` em runtime, para calibrar `RECENCY_RERANK_WEIGHT` e diagnosticar domínio indevido de rede vs. semântico vs. recência.

**Por que ADR-063:** Com P1 activo, `rankScore = finalScore + w_r × recencySimilarity` enquanto o modal ainda concentra percentagem em `finalScore` e brutos neural/semântico **sem** ligação explícita aos pesos nem ao termo de recência; isso desalinha a percepção da grelha ordenada por `rankScore`.

**Acceptance Criteria:**

1. WHEN `POST /api/v1/recommend` (e `POST /api/v1/recommend/from-cart` se devolver o mesmo envelope de ranking) completar com sucesso THEN a resposta JSON SHALL incluir um objecto opcional de nível-resposta **`rankingConfig`** (nome canónico; alias só se documentado) com pelo menos **`neuralWeight`**, **`semanticWeight`**, e **`recencyRerankWeight`** reflectindo valores **efectivos** lidos da configuração do processo (mesma fonte que `computeFinalScore` / `rankScore`).
2. WHEN `rankingConfig` estiver presente THEN o cliente SHALL poder calcular ou mostrar as parcelas do híbrido em **pontos** com `neuralWeight × neuralScore` e `semanticWeight × semanticScore` **sem** depender de variáveis públicas duplicadas como única fonte de verdade para esses três pesos.
3. WHEN o servidor optar por pré-calcular termos só para UI (`hybridNeuralTerm`, `hybridSemanticTerm`, `recencyBoostTerm` ou nomes finais alinhados ao código) THEN esses valores SHALL ser derivados da mesma expressão que o ranking usa; o cliente MAY preferir estes campos quando presentes para evitar duplicar `computeFinalScore`.
4. WHEN `recencyRerankWeight` for `0` (ou equivalente “boost inactivo”) THEN a UI SHOULD continuar a mostrar o resumo híbrido coerente com `rankingConfig` e MAY omitir secções puramente de boost de recência se não houver `rankScore` distinto.
5. WHEN `recencyRerankWeight > 0` e o item for elegível com scores THEN o fluxo até ao modal (`adaptRecommendations` → estado de recomendações → `scoreMap` em `CatalogPanel` → `ProductDetailModal`) SHALL propagar `recencySimilarity` e `rankScore` quando o upstream os enviar; o modal SHALL apresentar `recencySimilarity`, o incremento `rankScore − finalScore`, e **rótulo explícito** de `rankScore` como chave de ordenação da grelha em modo ranking.
6. WHEN `recencySimilarity` for `0` (âncora ausente ou cosseno nulo) THEN o incremento de recência SHALL ser mostrado como `0` ou “neutro” de forma **não** ambígua (não inferir `w_r` por divisão como única prova).
7. WHEN o payload **não** incluir `rankingConfig` (versão antiga do serviço ou fallback) THEN o frontend SHALL degradar com UI mínima segura: manter `finalScore` / brutos se existirem e **não** afirmar pesos runtime que não vieram do servidor.
8. WHEN existir teste automatizado de contrato ou E2E para o modal THEN a superfície de resumo SHOULD expor `data-testid="product-detail-score-summary"` (ou prefixo acordado único) para asserções estáveis.

**Independent Test:** Capturar JSON de `recommend` com `recencyRerankWeight > 0`, abrir modal de um SKU elegível no topo: verificar que os números de peso e parcelas coincidem com `rankingConfig` e fórmulas do [design §11](./design.md) (ou com termos pré-calculados se implementados).

---

### P2: Perfil de cliente com pooling ponderado (treino alinhado à inferência) — Fase 2

**User Story:** Como cientista de dados da plataforma, quero que o vector de perfil do cliente agregue embeddings de compras confirmadas com **pesos que favorecem compras recentes** (decaimento exponencial por idade da compra, ou alternativa documentada), **à letra iguais** em `buildTrainingDataset` e nos fluxos `recommend` / `recommendFromCart`, para o gradiente do MLP reflectir recência e não apenas o boost de re-ranking (P1).

**Por que P2:** Fecha o gap “média uniforme trata 2020 = hoje” sem exigir arquitectura de sequência (P3); exige **retreino** e disciplina treino/inferência ([ADR-062](./adr-062-phased-recency-ranking-signals.md)).

**Estado:** **Implementado no `ai-service`** (2026-05-01); ver [tasks.md](./tasks.md) T12–T22.

#### Definições (canónicas para P2)

- **Compra confirmada:** relação `BOUGHT` com `coalesce(is_demo, false) = false` e `order_date IS NOT NULL` — **mesmo critério temporal** que [M16 / âncoras P1](./design.md) (`getConfirmedPurchaseLastDates`, `getRecentConfirmedPurchaseAnchorEmbeddings`).
- **Instante de compra por produto:** para cada `productId`, \(t_i = \max(\texttt{order\_date})\) sobre todas as linhas `BOUGHT` confirmadas desse cliente para esse produto (uma linha agregada por SKU).
- **Instante de referência \(T_{\mathrm{ref}}\):**
  - **Inferência** (`recommend`): \(T_{\mathrm{ref}}\) = instante da **requisição** (e.g. `Date` do processamento), em UTC ISO comparável aos `order_date` normalizados.
  - **Treino** (`buildTrainingDataset`): por cliente, \(T_{\mathrm{ref}}^{\,(c)}\) = **máximo** dos `order_date` normalizados desse cliente **no snapshot de orders** usado nessa época de treino (comportamento “após a última compra observada do cliente no snapshot”).
- **Idade da compra:** \(\Delta_i = T_{\mathrm{ref}} - t_i\) em dias (número real **≥ 0**; se \(t_i > T_{\mathrm{ref}}\) por inconsistência de dados, tratar como \(\Delta_i = 0\) e registar *warning* opcional — ver Edge Cases).
- **Pool de embeddings:** lista de pares `(embedding_i, \Delta_i)` com `embedding_i` não nulo e mesma dimensão que o catálogo. Produtos sem embedding **excluem-se** do pool (como hoje); não entram no denominador de normalização.
- **Modo `mean` (default / flag off):** \(\textbf{p} = \frac{1}{N}\sum_i \textbf{e}_i\) — comportamento actual (`meanPooling`).
- **Modo `exp` (flag on, default P2):** pesos \(w_i = \exp(-\Delta_i / \tau)\) com **meia-vida** \(H > 0\) em dias e \(\tau = H / \ln 2\); vector normalizado  
  \(\textbf{p} = \frac{\sum_i w_i \textbf{e}_i}{\sum_i w_i}\).  
  Alternativas (e.g. linear decay) só com **ADR ou secção `design`** explícita e mesma fórmula em treino+inferência.

**Acceptance Criteria:**

1. **(PRS-11)** WHEN a flag de P2 estiver **desligada** (nome canónico em `env` / `design`, e.g. `PROFILE_POOLING_MODE=mean` ou ausente com default `mean`) THEN `buildTrainingDataset`, `recommend` e `recommendFromCart` SHALL produzir o mesmo vector de perfil que hoje (**média aritmética** sobre os embeddings elegíveis do conjunto respectivo), byte-a-byte ou dentro de tolerância numérica documentada (`ε` em float32).
2. **(PRS-12)** WHEN a flag estiver **ligada** (`PROFILE_POOLING_MODE=exp` ou valor único acordado) THEN o sistema SHALL calcular o perfil apenas através de uma **única função exportada** partilhada (e.g. `aggregateClientProfileEmbeddings` em módulo dedicado importado por `training-utils` e `RecommendationService`), **sem** duplicar a lógica de pesos entre ficheiros.
3. **(PRS-23)** WHEN o modo `exp` estiver activo THEN cada par `(embedding, \Delta)` usado no pool SHALL derivar de **compras confirmadas** com `order_date` e da regra de \(t_i\) e \(T_{\mathrm{ref}}\) acima; o `design` SHALL documentar o mapeamento exacto para **treino** (API `orders`) e **inferência** (Neo4j), de forma que dois caminhos com os mesmos factos de compra produzam o **mesmo** \(\textbf{p}\) (modulo fonte de verdade eventualmente desfasada entre DB e API — ver Edge Cases).
4. **(PRS-24)** WHEN o `ModelTrainer` construir dados para `buildTrainingDataset` THEN o contrato de entrada SHALL deixar de depender **apenas** de `Map<clientId, Set<productId>>` sem datas — SHALL existir estrutura com **datas por compra ou por `(clientId, productId)`** suficiente para calcular \(t_i\) e \(T_{\mathrm{ref}}^{\,(c)}\) por cliente (ex.: lista de orders ordenada, ou mapa `productId → lastPurchaseIso` + orders para max data).
5. **(PRS-25)** WHEN `PROFILE_POOLING_MODE=exp` THEN o sistema SHALL ler **`PROFILE_POOLING_HALF_LIFE_DAYS`** \(H\) (float **> 0**, default documentado e.g. `30`); valores inválidos (≤ 0, `NaN`, infinito) SHALL falhar no **arranque** com mensagem clara (alinhado a **PRS-10**); ausente ⇒ default documentado.
6. **(PRS-26)** WHEN `recommend` executar em modo `exp` THEN os embeddings e metadados temporais SHALL obter-se de Neo4j com **mesma semântica** que P1 (confirmado, `order_date`, embedding presente), com **ordem determinística** por `lastPurchase DESC`, `productId ASC` para empates — alinhável à query de âncoras alargada a **todos** os produtos comprados (não só `LIMIT N`).
7. **(PRS-27)** WHEN `recommendFromCart` executar em modo `exp` THEN itens do **carrinho** SHALL entrar no pool com \(\Delta = 0\) (máximo peso) **junto com** o histórico confirmado do cliente com as suas idades reais; a agregação SHALL ser **uma** passagem `aggregateClientProfileEmbeddings` sobre a união ordenada/documentada (ex.: histórico por \(\Delta\) crescente + cart no bucket mais recente).
8. **(PRS-28)** WHEN P1 (`RECENCY_RERANK_WEIGHT > 0`) e P2 (`exp`) estiverem **simultaneamente** activos THEN o sistema SHALL **manter** `finalScore` apenas neural+semântico e `rankScore = finalScore + w_r \cdot recencySimilarity`; o perfil ponderado SHALL afectar apenas **inputs** ao MLP / semântica, **não** a definição de `finalScore` (coexistência explícita [ADR-062](./adr-062-phased-recency-ranking-signals.md)).
9. **(PRS-13)** WHEN se integrar P2 THEN o autor da mudança SHALL registar no [STATE.md](../../project/STATE.md) ou nota de release **baseline** de `precisionAt5` (ou métrica canónica do repo) com P1-only vs P2+retreino, e SHALL executar o gate de testes do `ai-service` conforme [.specs/codebase/ai-service/TESTING.md](../../codebase/ai-service/TESTING.md) (ou sucessor).
10. **(PRS-29)** WHEN `rankingConfig` for estendido para P2 (opcional) THEN quaisquer campos novos (`profilePoolingMode`, `profilePoolingHalfLifeDays`, etc.) SHALL reflectir valores **efectivos** de runtime, sem obrigar mudança de UI na primeira entrega P2.

**Independent Test:** (1) Com P2 off, *golden* de vector de perfil idêntico ao `meanPooling` actual para um cliente fixo. (2) Com P2 on, mesmo conjunto de `(e_i, \Delta_i)` em `training-utils` e em teste unitário importando a **mesma** função, vector \(\textbf{p}\) idêntico. (3) Retreino mínimo em snapshot fixo: métrica offline registada vs baseline (PRS-13).

---

### P3: Atenção sobre sequência de pedidos — Fase 3

**User Story:** Como arquiteto de ML, quero um caminho de modelo que condicione recomendações à sequência temporal de pedidos, quando o volume de eventos por cliente justificar o custo.

**Por que P3:** Evolução de modelo e contrato; não é toggle equivalente às fases 1–2 ([ADR-062](./adr-062-phased-recency-ranking-signals.md)).

**Acceptance Criteria (alto nível):**

1. WHEN a Fase 3 for priorizada THEN existirá `design` dedicado (artefacto, dimensões, formato de features temporais).
2. WHEN não houver dados suficientes por cliente THEN o sistema SHALL degradar para o melhor caminho suportado documentado (ex.: Fase 2 ou 1).

**Independent Test:** N/A neste milestone até `plan`/`design` da fatia P3.

---

## Edge Cases

### P1 / transparência (existentes)

- WHEN o cliente só tiver compras cuja embedding não está disponível nas âncoras THEN o boost SHALL ser neutro (equivalente a peso `0` em efeito na ordem).
- WHEN `N > 1` âncoras forem configuradas e os cossenos forem heterogéneos THEN a política de agregação (máx. vs média) SHALL ser única e documentada; default permanece **máximo** até decisão contrária em `design`.
- WHEN `RECENCY_RERANK_WEIGHT` for muito alto THEN o sistema SHALL continuar a respeitar elegibilidade M16 antes de qualquer re-ranking (sem “saltar” supressão).
- WHEN existir empate numérico na chave de ranking THEN o desempate SHALL ser determinístico (ex.: `sku` ou `id` lexicográfico) e documentado.
- WHEN `rankingConfig` estiver ausente no payload THEN o modal SHALL NOT inventar pesos a partir de heurísticas silenciosas no cliente (PRS-21 / AC ADR-063).
- WHEN `rankScore` e `finalScore` diferirem THEN a copy da UI SHALL deixar claro qual valor ordena a grelha em modo ranking (evitar “Score final %” como sinónimo único de ordem).

### P2 — pooling ponderado

- WHEN o cliente tiver **zero** embeddings elegíveis após filtros THEN o fluxo SHALL degradar como hoje (`ClientNoPurchaseHistoryError` em `recommend`, ou política documentada para treino: omitir cliente sem amostras).
- WHEN existir **um único** embedding no pool THEN o vector de perfil SHALL coincidir com esse embedding (mean e `exp` degeneram ao mesmo vector).
- WHEN \(t_i > T_{\mathrm{ref}}\) por *clock skew* ou dados THEN \(\Delta_i\) SHALL ser tratado como `0` para esse \(i\) (peso máximo) e o sistema MAY emitir *warning* em log (não falhar a requisição).
- WHEN treino usar snapshot de orders **desfasado** do Neo4j em runtime THEN o *design* SHALL documentar a fonte de verdade preferida e limites aceitáveis (P2 assume alinhamento típico pós-sync de `ModelTrainer`).
- WHEN `recommendFromCart` tiver carrinho **sem** histórico comprado THEN o pool SHALL conter apenas embeddings do carrinho com \(\Delta=0\); com um item, perfil = esse embedding.

---

## Requirement Traceability

**Prefixo:** `PRS-*` (Phased Recency Signals). **P1 + ADR-063 (PRS-01–22):** verificados no código (2026-05-01). **P2:** PRS-11–13 e PRS-23–29 **implementados** (2026-05-01). **P3:** PRS-14–15 pendentes.

| ID | Story | Fase | Rastreio | Tarefa(s) |
|----|-------|------|----------|-----------|
| PRS-01 | P1: `finalScore` só neural+semântico | 1 | **Verificado** | T3 |
| PRS-02 | P1: Peso `0` ⇒ mesma ordem que `finalScore` | 1 | **Verificado** | T1, T3, T5 |
| PRS-03 | P1: Âncoras a partir de compras confirmadas; `N` configurável default 1 | 1 | **Verificado** | T1, T2, T3 |
| PRS-04 | P1: Similaridade cosseno + agregação (default máx.) | 1 | **Verificado** | T3, T5 |
| PRS-05 | P1: `rankScore` separado de `finalScore` | 1 | **Verificado** | T3, T5 |
| PRS-06 | P1: Degradação segura sem âncora | 1 | **Verificado** | T2, T3, T5 |
| PRS-07 | P1: Boost só sobre candidatos já elegíveis | 1 | **Verificado** | T3, T5 |
| PRS-08 | P1: Consistência `recommend` / `recommendFromCart` | 1 | **Verificado** | T3, T5 |
| PRS-09 | P1: Transparência API (`recency`/`rank`/`rankingConfig`) | 1 | **Verificado** | T4, T6, **T7** |
| PRS-10 | P1: Validação de configuração inválida | 1 | **Verificado** | T1, T5 |
| PRS-11 | P2: Flag off ⇒ `mean` idêntico ao legado | 2 | **Verificado** | T13, T15, T18 |
| PRS-12 | P2: Uma função partilhada treino+inferência | 2 | **Verificado** | T13, T15, T19 |
| PRS-13 | P2: Baseline métrica + gate `ai-service` ([TESTING](../../codebase/ai-service/TESTING.md)) | 2 | **Verificado** | T21, T22 |
| PRS-14 | P3: `design` dedicado antes de implementação | 3 | N/A (P3) | — |
| PRS-15 | P3: Degradação com poucos eventos | 3 | N/A (P3) | — |
| PRS-16 | ADR-063: `rankingConfig` na resposta HTTP | 063 | **Verificado** (`ai-service`) | T7 |
| PRS-17 | ADR-063: Proxy/UI preservam `rankingConfig` | 063 | **Verificado** | T8, T9 |
| PRS-18 | ADR-063: Parcelas no modal | 063 | **Verificado** | T9, T10 |
| PRS-19 | ADR-063: Sem drift `NEXT_PUBLIC_*` só | 063 | **Verificado** | T8, T10 |
| PRS-20 | ADR-063: Termos pré-calculados opcionais coerentes | 063 | **Verificado** (`ai-service` + consumo no modal) | T7, T10 |
| PRS-21 | ADR-063: Degradação sem `rankingConfig` | 063 | **Verificado** | T10 |
| PRS-22 | ADR-063: `data-testid` + superfície de teste | 063 | **Verificado** | T10, T11 |
| PRS-23 | P2: Semântica temporal \(t_i\), \(T_{\mathrm{ref}}\) treino vs inferência | 2 | **Verificado** | T13, T14, T15 |
| PRS-24 | P2: Contrato de dados com datas (não só `Set` sem tempo) | 2 | **Verificado** | T14, T15, T16 |
| PRS-25 | P2: `PROFILE_POOLING_HALF_LIFE_DAYS` + validação arranque | 2 | **Verificado** | T12 |
| PRS-26 | P2: Neo4j ordenado / coerente com M16 para perfil | 2 | **Verificado** | T17, T18 |
| PRS-27 | P2: `recommendFromCart` — carrinho \(\Delta=0\) + histórico | 2 | **Verificado** | T18 |
| PRS-28 | P2: Coexistência com boost P1 (`finalScore` / `rankScore` intactos) | 2 | **Verificado** | T18 |
| PRS-29 | P2: Extensão opcional `rankingConfig` coerente | 2 | **Verificado** | T20 |

**Coverage:** PRS-01–10 (P1 núcleo) e PRS-16–22 (ADR-063) **verificados**. **P2:** PRS-11–13, PRS-23–29 mapeados e **verificados** em código/docs — [tasks.md](./tasks.md) T12–T22. **P3:** PRS-14–15.

---

## Success Criteria

- [x] Com peso `0`, regressão zero na ordem de ranking relativamente ao comportamento actual do `ai-service` (teste automatizado ou snapshot aprovado).
- [x] Com peso `> 0`, existe cenário de teste (unitário ou integração) em que a ordem de dois SKUs com `finalScore` próximo ou invertível muda de acordo com a similaridade à âncora, mantendo `finalScore` idêntico por SKU.
- [x] `.env.example` documenta o peso da Fase 1 e o parâmetro `N` (nomes finais alinhados à implementação).
- [ ] Documento de release ou nota no `STATE.md` regista baseline de métrica quando se começar a calibrar pesos > 0 (pode ser após implementação).
- [x] **P2:** `.env.example` + `ai-service/README.md` documentam `PROFILE_POOLING_MODE`, `PROFILE_POOLING_HALF_LIFE_DAYS` (nomes finais alinhados ao código).
- [x] **P2:** Testes unitários cobrem *golden* mean vs `exp` e import único da função de agregação (PRS-11, PRS-12, *Independent Test* da história P2).
- [x] **ADR-063:** `rankingConfig` no payload; modal alinhado; documentação e ADR *Accepted*.

---

## Brownfield touchpoints

- `smart-marketplace-recommender/ai-service/src/services/RecommendationService.ts` — cálculo híbrido e ordenação.
- `smart-marketplace-recommender/ai-service/src/config/env.ts` — novas variáveis ortogonais.
- `smart-marketplace-recommender/ai-service/src/types/index.ts` — extensão opcional do contrato `RecommendationResult`.
- `smart-marketplace-recommender/ai-service/src/repositories/Neo4jRepository.ts` — consultas para embeddings e ordem temporal de compras (âncoras P1; **P2:** perfil com `lastPurchase` / `order_date` alinhado a M16).
- **P2:** `ModelTrainer.ts` + `training-data-fetch` / orders — enriquecer contrato para datas por compra (**PRS-24**).
- **P2:** Novo módulo partilhado (nome em *design*) para `aggregateClientProfileEmbeddings` — **PRS-12**.
- **ADR-063 (entregue):** `rankingConfig` + termos no `ai-service`; proxy Next repassa; `adaptRecommendations` + `recommendationSlice` + `CatalogPanel` / `ProductDetailModal`.

---

## Next workflow step (tlc-spec-driven)

1. ~~**`design feature`**~~ — [design.md](./design.md) (incl. §11 ADR-063).
2. ~~**`tasks`**~~ — [tasks.md](./tasks.md) (T1–T11, rastreio PRS incl. 16–22).
3. **M17 P2** — ~~`specify`~~ → ~~`design` complex~~ ([design.md §13](./design.md#13-m17-p2--design-complex-pooling-treinoinferência), [ADR-065](./adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md)) → ~~**`tasks`**~~ (T12–T22 em [tasks.md](./tasks.md)) → **`execute`**.
4. **M17 P3** — `plan` → `specify` (extensão) → `design` → `tasks` → `execute` quando priorizado ([ADR-062](./adr-062-phased-recency-ranking-signals.md)).

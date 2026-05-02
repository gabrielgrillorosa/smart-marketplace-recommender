# Project State

_Last updated: 2026-05-01 — **M16** ✅; **M17** P1 + **ADR-063/064** ✅ (`ai-service` + `frontend`); **M17 P2** (profile pooling / ADR-065) ✅ **`ai-service`** (2026-05-01); **pendente M17:** **P3** (atenção) — [spec M17](../features/m17-phased-recency-ranking-signals/spec.md). **M18** (AD-055) ✅. **M19** (ADR-065 / ADR-066 Pos-Efetivar deltas) ✅ **IMPLEMENTED** (2026-05-01) — [spec](../features/m19-pos-efetivar-showcase-deltas/spec.md). **M21** (ADR-070 + ADR-071 + ADR-072 + **[ADR-073](../features/m21-ranking-evolution-committee-decisions/adr-073-m21-attention-learned-json-pooling.md)** `attention_learned`) — [spec M21](../features/m21-ranking-evolution-committee-decisions/spec.md); [ADR-072](../features/m21-ranking-evolution-committee-decisions/adr-072-m21-profile-pooling-defer-learned-attention-logits.md). Próximo foco: **M17 P3** ou **M20 execute** / **M21 execute** conforme prioridade._

---

## Current Focus

**Current planning:** **M17** — Fase 1 + transparência de score **entregues**; **M17 P2** (pooling perfil treino+inferência / ADR-065) **entregue no `ai-service`** (2026-05-01). **Seguinte:** **M17 P3** (atenção temporal) conforme [ADR-062](../features/m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md). **M18 — Catálogo simplificado (AD-055)** ✅ **COMPLETE** (2026-04-30) — [spec M18](../features/m18-catalog-simplified-ad055/spec.md). E2E [`m18-catalog-ad055.spec.ts`](../../frontend/e2e/tests/m18-catalog-ad055.spec.ts).

**M17 — P1 + ADR-063/064 IMPLEMENTED** — [ADR-062](../features/m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md) (re-rank, `rankScore` / `recencySimilarity`); [ADR-063](../features/m17-phased-recency-ranking-signals/adr-063-score-breakdown-api-and-product-detail-modal.md) + [ADR-064](../features/m17-phased-recency-ranking-signals/adr-064-rankingconfig-zustand-recommendation-slice.md) (`rankingConfig`, modal). Operador: [ai-service/README.md](../../ai-service/README.md). **M16 — ✅ COMPLETE** (2026-04-30).

### Fila de planeamento (ordem para `plan feature` → `ROADMAP` + `.specs/features/`)

| # | Prioridade | O quê | Onde está o detalhe | Próximo passo **tlc-spec-driven** |
|---|------------|--------|---------------------|-----------------------------------|
| **P1** | Concluído | **M17** — Fase 1 + ADR-063/064 | [spec M17](../features/m17-phased-recency-ranking-signals/spec.md); [tasks](../features/m17-phased-recency-ranking-signals/tasks.md) | Baseline métrica / staging se necessário |
| **P2** | Concluído (2026-05-01) | **M17 Fase 2** — pooling perfil treino+inferência | [spec M17 P2](../features/m17-phased-recency-ranking-signals/spec.md); [ADR-065](../features/m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md) | Baseline offline `precisionAt5` com `PROFILE_POOLING_MODE=exp` em staging quando priorizado |
| **P3** | Próximo (M17) | **M17 Fase 3** — atenção temporal | [spec M17 P3](../features/m17-phased-recency-ranking-signals/spec.md); PRS-14–15 | `plan` → design dedicado → `execute` |
| **—** | Concluído | **M18 — Catálogo / contrato — AD-055** | [AD-055](#state-ad-055); [spec M18](../features/m18-catalog-simplified-ad055/spec.md) | Verificação em `docker compose` / staging |
| **—** | Concluído | **M19 — Pos-Efetivar deltas (ADR-065 / ADR-066)** | [ADR-065](../features/m19-pos-efetivar-showcase-deltas/adr-065-post-checkout-column-deltas-baseline.md); [spec M19](../features/m19-pos-efetivar-showcase-deltas/spec.md); [tasks](../features/m19-pos-efetivar-showcase-deltas/tasks.md) | Verificação E2E `frontend` |
| **—** | **Planeado** | **M20** — manual retrain + métricas + Pos-Retreino (ADR-067) | [spec M20](../features/m20-manual-retrain-metrics-pos-retreino/spec.md); [design M20](../features/m20-manual-retrain-metrics-pos-retreino/design.md); [ADR-067/068/069](../features/m20-manual-retrain-metrics-pos-retreino/adr-067-manual-retrain-metrics-showcase-pos-retreino.md); [tasks](../features/m20-manual-retrain-metrics-pos-retreino/tasks.md) | **Execute** (T067-1…T067-7) quando priorizado |
| **—** | **DESIGNED** | **M21** — ranking / perfil / híbrido (ADR-070 + ADR-071) | [spec M21](../features/m21-ranking-evolution-committee-decisions/spec.md); [design](../features/m21-ranking-evolution-committee-decisions/design.md); [ADR-071](../features/m21-ranking-evolution-committee-decisions/adr-071-m21-neural-head-and-pure-fusion-boundary.md); [tasks](../features/m21-ranking-evolution-committee-decisions/tasks.md) | **Execute** T21-1 → T21-7 quando priorizado |

Decisão explícita da ordem P1→P2: **[AD-056](#state-ad-056)**.

**Ao retomar:** **M17** — trabalhar **P2** ou **P3**; **M18** ✅ fechado; **M19** ✅ fechado (2026-05-01); débito técnico opcional: **AD-053** / [ADR-053](../features/m12-self-healing-model-startup/adr-053-tech-debt-migrate-seed-to-api-service.md).

**Previous:** Comite aprovou redesenho arquitetural do MVP em torno de `Cart` no `api-service` + `Order` como unico ground truth (AD-043)

---

## Decisions

### AD-054: Comite — Showcase didatico `neural-first` com suppression temporal de compras recentes, seed denso por categoria e explicabilidade de elegibilidade (2026-04-29)

**Decision:** O projeto adota explicitamente a direcao **`neural-first`** para o eixo didatico de recomendacao. Regra final: (1) **nenhum boost matematico de negocio** sera adicionado ao `finalScore` para forcar categoria/marca; a emergencia de afinidade por categoria deve continuar vindo do vetor de perfil + rede neural + similaridade semantica ja existentes. (2) Regras deterministicas sao permitidas **somente na camada de elegibilidade/candidate pool**, nunca na de ranking: pais, disponibilidade, itens no carrinho e agora **compras recentes**. (3) A exclusao atual "comprou uma vez -> some para sempre" deixa de ser a politica-alvo do produto; o caminho aprovado e **suppression temporal por janela** (`RECENT_PURCHASE_WINDOW_DAYS`, default inicial sugerido `7`) com o produto permanecendo visivel no catalogo, marcado como `comprado recentemente / fora do ranking nesta janela`, com motivo e data de retorno. (4) O catalogo passa a ser tratado como **vitrine completa**, enquanto `Ranking IA` vira uma lente sobre a vitrine: produtos inelegiveis nao somem silenciosamente, apenas ficam fora do ranking principal e precisam ser explicados visualmente. (5) Para que o aprendizado de categoria emerja da rede sem truques de score, o seed sintetico deve ser ampliado: **piso aceitavel ~85 SKUs / alvo preferido ~125 SKUs**, com 20-25 produtos nas categorias centrais (`beverages`, `food`), mais suppliers, mais clientes, mais pedidos, viés por `segment x category`, maior taxa de recompra e descricoes mais diversas. (6) O proximo milestone candidato fica registrado como **M16 — Neural-First Didactic Ranking & Catalog Density**, cobrindo cooldown de compras recentes, painel de "compras recentes", badges de supressao, separacao `Vitrine x Ranking IA`, bloco "o que mudou no modelo" e refresh do seed/dataset.

**Reason:** O uso do sistema mudou: agora o objetivo principal e **didatico**, e o avaliador nao consegue lembrar quais produtos ja comprou. No estado atual, a regra de exclusao por comprado e silenciosa e permanente, o que faz itens "sumirem" sem explicacao e produz a impressao de bug. Pior: com o seed atual (~52 produtos, 5 categorias), o pool por categoria/pais se esgota rapido demais; por exemplo, apos poucas compras em `beverages`, restam candidatos insuficientes para o ranking neural mostrar aprendizado visivel da categoria. O Comite (Professor Doutor em Engenharia de IA Aplicada, Professor Doutor em Deep Learning, Principal AI Architect, Staff Design/UX React/Next.js, Staff Product Engineer) convergiu que isso nao se resolve com boost manual no score — isso mascararia o comportamento da rede. A solucao correta e separar **eligibility** de **ranking**, como fazem os grandes players e a literatura de two-stage recommenders: filtros duros antes, modelo neural ordenando apenas o conjunto elegivel. A referencia de mercado para repeat purchase/replenishment (Amazon `Buy It Again`, Instacart recommendations/replacements) reforca a separacao entre descoberta, recompra e regras de recencia.

**Trade-off:** (1) A UI fica mais complexa, porque itens fora do ranking deixam de "sumir" e passam a carregar estados explicitos (`comprado recentemente`, `demo`, `fora do pais`, etc). Isso e desejado didaticamente, mas aumenta superficie visual e de testes. (2) A janela de cooldown nao e "aprendida"; e uma regra operacional/contratual da camada de elegibilidade. O comite considera isso aceitavel porque **nao mexe no score** e precisa ser mostrado como filtro, nao como inteligencia. (3) Expandir o seed aumenta tempo de cold start, custo de embeddings e tempo de treino, alem de exigir re-baseline de metrica (`precisionAt5`) e possivel recalibracao de `SOFT_NEGATIVE_SIM_THRESHOLD` / `negativeSamplingRatio`. (4) A superficie de recompra/replenishment fica **deferida**; neste milestone a prioridade e preservar a pureza neural do ranking principal e tornar as ausencias explicaveis, nao construir ainda uma lane separada de "Buy Again / Repor mix".

**Impact:** **`ai-service`**: `getCandidateProducts` deixa de tratar historico comprado como exclusao vitalicia e passa a trabalhar com janela de compras recentes; respostas de recomendacao devem expor metadados de itens suprimidos/reasons quando necessario; `RecommendationService` continua sem boost manual por categoria/supplier. **Seed/data**: ampliar `products.ts`, `suppliers.ts`, `clients.ts` e `orders.ts` para suportar densidade real de categoria, suppliers adicionais, pedidos com vies por segmento e repeticao suficiente para a rede aprender afinidade de categoria sem artificios. **Frontend**: introduzir painel `Compras recentes`, badges de elegibilidade (`comprado recentemente`, `fora do ranking nesta janela`, `demo`, `fora do pais`), separacao clara entre `Modo Vitrine` e `Modo Ranking IA`, e bloco explicativo "o que mudou no modelo" para atribuir o uplift ao comportamento neural e nao a regras escondidas. **Roadmap**: reservar o nome `M16` para esse eixo didatico neural-first; o debito de ADR-053 (migrar seed do `ai-service` para o `api-service`) deixa de usar `M16` como candidato padrao e passa a ser tratado como spike/debito independente quando priorizado.

**Coverage after AD-054:** `M16` com `spec.md` (38× `NFD-*`), `design.md`, `tasks.md`, ADRs 055–061, implementação no monorepo, E2E `m16-catalog-modes` e critérios de fecho aceites pelo dono do repositório (incl. métricas / T15).

**Status:** Approved by Committee ✓ + Specified ✓ + Designed ✓ + **Executed / COMPLETE** ✓ (2026-04-30).

---

### ADR-072: Adiar logits aprendidos no pooling `attention_light` (2026-05-01)

**Decisão:** Não integrar, neste momento, **logits com parâmetros aprendidos** (`w`, `b`, `λ` sobre embeddings de compra) em `aggregateClientProfileEmbeddings`; manter **M21 A** com fórmula fechada. A evolução proposta fica **candidata** sujeita a RFC/ADR filho, artefacto versionado e validação offline (fase 1) antes de eventual joint training (fase 2).

**Registo completo:** [ADR-072](../features/m21-ranking-evolution-committee-decisions/adr-072-m21-profile-pooling-defer-learned-attention-logits.md). **Modo dedicado implementado:** [ADR-073](../features/m21-ranking-evolution-committee-decisions/adr-073-m21-attention-learned-json-pooling.md) (`attention_learned` + JSON).

**Estado:** Aceite (comité informal ToT + auto-consistência).

---

<a id="state-ad-055"></a>

### AD-055: Direcção de produto — catálogo, API e IA sem toggle Vitrine/Ranking (2026-04-30)

**Natureza:** registo explícito do pedido de evolução de UX/contrato para **planeamento** de features (delta em relação ao M16 entregue e ao AD-054). **Não** revoga automaticamente AD-054 nem os ADRs M16 até passar por actualização de `spec.md` / comité se necessário.

**Pedido do produto (verbatim resumido):**

1. **Remover** a caixa / painel **«Compras recentes»** (lista separada no topo com produtos recém-comprados e texto tipo «Retorno ao ranking: …»).
2. **Backend:** produtos **não disponíveis no país** e demais inelegíveis **que não sejam** bloqueio por compra recente **não devem ser retornados** na API ao cliente (deixam de aparecer no payload em vez de virem como linhas com `eligible: false` e motivo).
3. **Excepção:** apenas produtos inelegíveis **por compra recente** (`recently_purchased` / janela de supressão) devem continuar a ser **mostrados no ecrã**, integrados no fluxo do catálogo (não como painel isolado).
4. **Remover** o toggle **«Modo Vitrine» / «Modo Ranking IA»** — deixa de haver dois modos globais alternados por botão dedicado.
5. **Comportamento único:** quando o utilizador clicar em **«Ordenar por IA»**, o sistema deve **já** aplicar a ordenação por IA **e** colocar os produtos só inelegíveis por compra recente **no final** da lista principal, agrupados sob o cabeçalho visual **—— Fora do ranking nesta janela ——** (comportamento tipo «fora do ranking nesta janela» sem caixa separada de «compras recentes»).

**Implicações técnicas (para tasks futuras):**

| Área | Acção provável |
|------|----------------|
| `ai-service` / `RecommendationService` | Resposta `POST /recommend` (e/ou `eligibilityOnly`): omitir do JSON candidatos com `eligibilityReason` ∈ {`no_embedding`, fora do país / catálogo país, `in_cart`, …} — **manter** apenas inelegíveis `recently_purchased` para render no rodapé. Alinhar com revisão do [ADR-055](../features/m16-neural-first-didactic-ranking-catalog-density/adr-055-eligibility-enriched-recommendation-contract.md) (contrato «merged»). |
| Frontend | Remover `RecentPurchasesPanel` (ou equivalente); remover estado/toggle **vitrine vs ranking** ([ADR-056](../features/m16-neural-first-didactic-ranking-catalog-density/adr-056-view-mode-zustand-flag-catalog-view-mode-hook.md)); `CatalogPanel`: ao activar «Ordenar por IA», ordenar elegíveis e anexar secção com copy fixa **—— Fora do ranking nesta janela ——**. |
| Pré-fetch elegibilidade ([ADR-058](../features/m16-neural-first-didactic-ranking-catalog-density/adr-058-early-eligibility-prefetch-on-client-select.md)) | Reavaliar: se o backend deixar de devolver «inelegíveis silenciosos», o prefetch pode limitar-se a metadados necessários para **recent** ou ser substituído pela resposta única pós-«Ordenar por IA». |
| E2E | Substituir / alinhar com `m18-catalog-ad055.spec.ts` (legado `m16-catalog-modes.spec.ts` removido na entrega M18). |
| `NFD-01..38` | Rever requisitos que mandam painel «Compras recentes» e separação explícita Vitrine/Ranking. |

**Status:** **IMPLEMENTED** ✓ (2026-04-30) — milestone **[M18](../features/m18-catalog-simplified-ad055/spec.md)** no [ROADMAP](ROADMAP.md); `ai-service` omite inelegíveis excepto compra recente na serialização HTTP; frontend sem painel «Compras recentes» nem toggle vitrine↔IA; E2E [`m18-catalog-ad055.spec.ts`](../../frontend/e2e/tests/m18-catalog-ad055.spec.ts). ADRs [055](../features/m16-neural-first-didactic-ranking-catalog-density/adr-055-eligibility-enriched-recommendation-contract.md) / [056](../features/m16-neural-first-didactic-ranking-catalog-density/adr-056-view-mode-zustand-flag-catalog-view-mode-hook.md) / [058](../features/m16-neural-first-didactic-ranking-catalog-density/adr-058-early-eligibility-prefetch-on-client-select.md) actualizados no âmbito da entrega.

---

<a id="state-ad-056"></a>

### AD-056: Fila de planeamento pós-M16 — M4 (ADR-062) antes de AD-055 catálogo (2026-04-30)

**Decision:** Após o fecho de **M16**, o planeamento de features segue esta ordem: **(P1)** materializar no roadmap e em `spec` o eixo **M4 / `ai-service`** de sinais de recência em fases, conforme **[ADR-062](../features/m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md)** (*Accepted*); **[ADR-016](../features/m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md)** (*Proposed*) permanece referência para trabalho futuro de calibração do híbrido, não bloqueia P1. **(P2)** em seguida, materializar **[AD-055](#state-ad-055)** (catálogo simplificado / contrato de payload e UX sem toggle vitrine↔IA).

**Reason:** Separa **política de implementação** de ranking e treino (`ai-service`) da **mudança de produto** em catálogo e contrato HTTP (AD-055), reduzindo conflito de escopo e permitindo `plan feature` / milestones claros no `ROADMAP.md`.

**Status:** **Recorded** — usar a tabela em *Current Focus* + *Todos* `[ ]` como checklist até ambos os planos estarem no `ROADMAP.md` e em `.specs/features/`.

---

### AD-053: AutoSeed — Débito técnico: migrar seed para `api-service` (2026-04-28)

**Decision:** Documentado como débito técnico rastreado. O `seed.ts` e o `AutoSeedService` residem no `ai-service` e escrevem diretamente no PostgreSQL, contornando o `api-service`. Isso é intencional até M15 mas será migrado em sessão futura (candidato M16 ou spike independente). A migração envolve 4 fases: (1) endpoint `POST /api/v1/admin/seed` no `api-service`; (2) Neo4j seeding via `sync-product` existente (ADR-015); (3) remoção do `seed.ts` e `AutoSeedService` do `ai-service`; (4) integração e E2E tests. Estimativa: ~4 dias de trabalho.

**Reason:** Em datasets sintéticos pequenos o acoplamento é aceitável. Em produção, o `api-service` deve ser o único escritor das tabelas de domínio (produtos, clientes, pedidos).

**Impact:** `ai-service` perde dependência de `pg` direta. `api-service` ganha `SeedApplicationService`. Boot continua zero-touch — só muda o serviço responsável pela semeadura.

**Status:** Proposed — não planejado ainda. Ver [ADR-053](../features/m12-self-healing-model-startup/adr-053-tech-debt-migrate-seed-to-api-service.md).

---

### AD-052: AutoSeed on Boot + Cache-Control bypass — entregues fora do roadmap (2026-04-28)

**Decision:** `AutoSeedService` adicionado ao boot do `ai-service` (antes de `listenAndScheduleRecovery`). Na cold start detectada (`isAlreadySeeded()` retorna `false`), executa `runSeed()` com pool/driver próprios de curta duração. `AUTO_SEED_ON_BOOT=true` por padrão. Simultâneamente, bug de cache poisoning no `api-service` foi corrigido: `ModelTrainer` envia `Cache-Control: no-cache` em todos os fetches de training data; `ProductController` mapeia o header para `noCache: boolean`; `@Cacheable(condition = "!#noCache")` garante que leituras internas nunca são servidas pelo Caffeine.

**Reason:** Antes dessa entrega, `docker compose up` em volumes vazios nunca atingia `/ready = 200` sem intervenção manual. O seed precisava ser executado manualmente antes do boot. O bug de cache poisoning fazia o `ModelTrainer` receber uma lista vazia de produtos cacheada de uma requisição anterior à semeadura, bloqueando permanentemente o treino.

**Impact:** Sistema completamente self-sufficient: `docker compose up` (qualquer estado dos volumes) → `/ready = 200` automaticamente. Warm restart: AutoSeed skipped (~0ms overhead). Cold start: ~5s extras para seed + ~3-7 min total (dominado pelo download do modelo HuggingFace na primeira vez).

**Status:** Accepted ✓ — entregue. Ver [ADR-052](../features/m12-self-healing-model-startup/adr-052-auto-seed-on-boot-and-cache-bypass.md) e [docs/diagrams/cold-start-boot-flow.md](../../docs/diagrams/cold-start-boot-flow.md).

---

### AD-045: Comite — Mecanismo de captura da coluna `Pos-Efetivar` em fluxo assincrono via polling em `/model/status` por mudanca de `version` (2026-04-28)

**Decision:** O frontend captura a coluna `Pos-Efetivar` em fluxo assincrono usando **polling em `GET /model/status`** monitorando a mudanca de `version` (Opcao 2 do parecer Staff). Mecanica: (1) `POST /carts/{clientId}/checkout` retorna `{ orderId, expectedTrainingTriggered: true }` e o frontend coloca o `ModelStatusPanel` em estado `training` imediatamente (alinhado com AD-044); (2) o frontend inicia polling em `/model/status` (que ja existe e retorna `version` + `precisionAt5` + estado do modelo); (3) quando `version` muda de `vN` para `vN+1`, dispara `fetchRecs(clientId)` -> `captureRetrained(clientId, recs)` e atualiza o `ModelStatusPanel` para `promoted`; (4) se a `version` nao muda mas o `lastTrainingResult` vira `rejected` (campo a ser exposto como parte de AD-040), a coluna `Pos-Efetivar` herda as recomendacoes do `current` com **banner ambar** explicando que o candidato foi rejeitado pela banda de tolerancia (Opcao 3a — alinhado com AD-039); (5) o `analysisSlice` ganha um campo `awaitingRetrainSince: number | null` que **sobrevive a reload** (incluido no `partialize` do `persist`), garantindo que mesmo apos `F5` o frontend continue esperando `version` mudar; (6) timeout de seguranca de 90s — apos esse tempo sem mudanca de `version` nem `rejected`/`failed`, o `ModelStatusPanel` mostra estado `unknown` com botao para forcar refetch manual.

**Reason:** Polling em `/model/status` foi escolhido sobre as alternativas porque: (a) **Opcao 1 (polling em `jobId` retornado pelo checkout)** acopla a UI a fila de jobs e nao sobrevive a reload sem persistir `jobId`; alem disso, exigiria expor `jobId` no contrato HTTP de checkout, o que polui a API com detalhe de implementacao do `ai-service`. (b) **Opcao 3 (SSE/WebSocket)** seria over-engineering para o MVP — exige nova infra de transporte e nao agrega valor proporcional ao custo; fica como `Deferred Idea` para pos-MVP. (c) **Opcao 2** se beneficia de estado ja modelado no AD-040 (`current/candidate/rejected`) — o frontend nao precisa entender filas de jobs, so precisa observar **transicoes do modelo current**; sobrevive a reload sem custo extra; e desacopla naturalmente de outros disparadores de retrain (ex: botao "modo demo" do AD-044), porque a UI sempre representa o estado **atual** do modelo, nao o estado de um job especifico. O Staff de Engenharia validou que essa abordagem reduz a quantidade de novos contratos HTTP e reaproveita `useRetrainJob` parcialmente (a parte de polling), exigindo apenas adaptar a fonte de verdade (de `jobId` para `version`).

**Trade-off:** (1) Race condition residual: se dois retreinos rodarem proximos no tempo (ex: usuario faz checkout e instrutor clica botao "modo demo" do AD-044 logo depois), a UI captura a `version` que aparecer primeiro e atribui ao checkout do cliente atual — mitigado pelo `ModelStatusPanel` mostrar a origem do treino (`Aprendendo com pedido #abc123` vs `Retreino manual disparado pelo modo demo`). (2) O contrato `/model/status` precisa expor `lastTrainingResult: 'promoted' | 'rejected' | 'failed'` + `lastTrainingTriggeredBy: 'checkout' | 'manual'` + `lastOrderId?: string` para a UI distinguir os casos — pequena extensao de payload alinhada com AD-040. (3) Polling padrao 2s tem custo de rede minusculo nesse MVP; em producao seria upgrade para SSE (deferred). (4) Caso `rejected` (Opcao 3a) reusa as recs do `current` na coluna `Pos-Efetivar`; isso pode parecer "sem efeito" pedagogicamente — banner ambar + texto explicativo no `ModelStatusPanel` precisam compensar essa "ausencia visivel de mudanca" para manter o valor didatico do showcase.

**Impact:** **`ai-service`**: estender `GET /model/status` com `lastTrainingResult`, `lastTrainingTriggeredBy`, `lastOrderId`, `currentVersion` (todos campos opcionais ate `M13`); persistir esses campos junto do `VersionedModelStore` (alinhado com AD-040). **`api-service`**: `POST /carts/{clientId}/checkout` retorna `{ orderId, expectedTrainingTriggered: boolean }`; no `expectedTrainingTriggered=false` (caso o gate de throttling/debounce decida nao treinar — ver pergunta pendente sobre frequencia), o frontend nao entra em estado `training`. **Frontend (`analysisSlice`)**: adicionar `awaitingRetrainSince: number | null`, `lastObservedVersion: string | null`, `awaitingForOrderId: string | null`; incluir esses tres campos no `partialize` do `persist`; novo selector `isAwaitingRetrain` derivado. **Frontend (`useRetrainJob` -> renomear para `useModelStatus`)**: trocar fonte de verdade de `jobId` para `version`; manter `epoch`/`samples`/`loss` (derivados do `lastTrainingProgress` exposto em `/model/status`). **`ModelStatusPanel`** (ver AD-044): consumir `useModelStatus`. **Persistencia de UI**: garantir que o `ModelStatusPanel` retoma o estado correto apos reload (ex: se o usuario fechou o navegador com retrain em andamento, ao reabrir deve continuar mostrando `training` ate `version` mudar ou ate o timeout de 90s).

**Coverage after AD-043:** `M13` — implementa polling por `version`, extensao do `/model/status` e captura assincrona da coluna `Pos-Efetivar`.

**Status:** Approved by Committee ✓ (Staff de Engenharia + Arquiteto de Solucoes IA + Arquiteto de Interface/UX, 2026-04-28). Depende de AD-044 (componente `ModelStatusPanel`) e AD-040 (campos `lastTrainingResult`/`current/candidate/rejected` no `/model/status`). Detalhes finos (`expectedTrainingTriggered` em caso de throttling) pendem da decisao sobre frequencia de retrain — ver Todos.

---

### AD-044: Comite — `RetrainPanel` evolui para `ModelStatusPanel` como ancora visual do ciclo de aprendizado pos-checkout (2026-04-28)

**Decision:** A caixa de retrain hoje conhecida como `RetrainPanel` **permanece na UI** apos AD-043 e e repaginada como `ModelStatusPanel` (renomeacao explicita para refletir nova responsabilidade). Mudancas-chave: (1) o **trigger primario de retrain e o `Efetivar Compra`** (AD-043), nao mais o botao manual; (2) o `ModelStatusPanel` continua existindo como **ancora visual do trabalho assincrono** — sem ele, a coluna `Pos-Efetivar` apareceria "do nada" 9s apos checkout e quebraria a narrativa pedagogica; (3) o botao "Retreinar Modelo" manual sai do fluxo principal mas **e preservado como ferramenta de instrutor/diagnostico** dentro de uma secao colapsada `Avancado` ou com badge `modo demo` (Opcao B do parecer anterior); (4) o painel ganha 5 estados visuais explicitos: **`idle`** (modelo atual + texto "Aguardando proximo pedido para aprender"), **`training`** (barra de progresso + epoch atual + "Aprendendo com pedido #abc123"), **`promoted`** (card emerald + delta `precisionAt5` + botao "Ver recomendacoes atualizadas" que rola ate a coluna `Pos-Efetivar`), **`rejected`** (card ambar com mensagem alinhada a AD-039: "Modelo candidato vN+1 rejeitado pela banda de tolerancia, modelo vN mantido"), **`failed`** (card vermelho + mensagem de erro + botao "Tentar novamente" que so funciona se a secao `Avancado` estiver habilitada).

**Reason:** O Arquiteto de Interface/UX (especialista em React/Next.js) aprovou a manutencao da caixa por tres razoes pedagogicas convergentes: (a) **Visibilidade do trabalho assincrono** (Nielsen #1 — *visibility of system status*): retrain leva ~9s no dataset atual, e sem feedback visual o usuario nao percebe que algo esta acontecendo nos bastidores; em sala de aula, o instrutor perde a janela narrativa de explicar "agora o modelo esta aprendendo com o pedido". (b) **Ancoragem do timeline `Sem IA -> Com IA -> Com Carrinho -> Pos-Efetivar`**: a coluna `Pos-Efetivar` precisa de uma fonte visual que diga "esta coluna existe e esta sendo preenchida"; sem o painel ativo, a coluna fica ambigua entre "esqueci de fazer algo", "ha um bug" e "esta esperando algo". (c) **Recuperacao de erros e estados de excecao**: com AD-039 (banda de tolerancia) e AD-040 (4-estados), o retrain pode terminar em `promoted/rejected/failed` — sem o painel, esses estados ficam invisiveis e o caso `rejected` (que reusa as recs do `current` na coluna `Pos-Efetivar`) parece um bug em vez de uma decisao explicita do gate. O Staff de Engenharia validou que e barato manter o componente: `useRetrainJob`, `TrainingProgressBar` (ADR-024 `scaleX`) e `ModelMetricsComparison` ja existem desde M9-B; a mudanca e de **trigger e linguagem**, nao de componentes novos.

**Trade-off:** (1) Convivencia de dois triggers (checkout primario + botao manual em modo demo) exige clareza visual sobre quem disparou o retrain — mitigado mostrando `Aprendendo com pedido #abc123` vs `Retreino manual` no estado `training`. (2) O caso `rejected` reusa visualmente as recs do `current` na coluna `Pos-Efetivar` (ver AD-045 Opcao 3a) — pedagogicamente "sem efeito visivel"; o painel precisa compensar com banner ambar bem desenhado para o usuario nao interpretar como bug. (3) Renomeacao `RetrainPanel -> ModelStatusPanel` afeta imports, testes E2E (`m9b-deep-retrain.spec.ts`) e referencias em design.md M9-B — exige migration consciente. (4) O botao "modo demo" no `Avancado` cria um caminho de codigo paralelo ao checkout (ainda chama `POST /model/train` direto); precisa ser claramente sinalizado como "fora do fluxo de producao" para nao virar atalho preferencial em demos rapidas.

**Impact:** **Frontend (`RetrainPanel.tsx`)**: renomear para `ModelStatusPanel.tsx`; remover botao "Retreinar Modelo" do escopo principal e mover para `<Collapsible>` "Avancado / Modo demo"; adicionar 5 estados visuais (`idle/training/promoted/rejected/failed`) com cores e copy distintos; consumir `useModelStatus` (renomeado de `useRetrainJob`, ver AD-045). **Frontend (`AnalysisPanel.tsx`)**: remover passagem de `retrainJob` como prop dependente de clique; o `ModelStatusPanel` passa a auto-disparar o estado `training` ao detectar `expectedTrainingTriggered=true` na resposta de checkout. **Frontend (textos)**: revisar todos os textos que diziam "Clique em Retreinar para..." -> trocar por "Apos efetivar uma compra, o modelo aprende com o pedido". **Testes E2E (`m9b-deep-retrain.spec.ts`)**: reescrever para fluxo `Adicionar ao Carrinho -> Efetivar Compra -> aguardar `ModelStatusPanel` ir para `promoted` -> validar coluna `Pos-Efetivar`. **Documentacao**: ADR-023 (M9-B "always-mounted AnalysisPanel"), ADR-024 (`scaleX`) e ADR-025 (`jobIdRef stale closure`) continuam validos mas com componente renomeado; atualizar referencias.

**Coverage after AD-043:** `M13` — renomeia `RetrainPanel` para `ModelStatusPanel`, muda o trigger primario para checkout e preserva o botao manual apenas em modo avancado/demo.

**Status:** Approved by Committee ✓ (Arquiteto de Interface/UX + Staff de Engenharia + Arquiteto de Solucoes IA, 2026-04-28). Confirma Opcao B do parecer anterior sobre o botao manual. Habilita AD-045.

---

### AD-043: Comite — Arquitetura final do MVP: `Carrinho -> Pedido confirmado -> Treino`, com carrinho no `api-service`/PostgreSQL e embeddings pre-computados no Neo4j (2026-04-28)

**Decision:** O MVP adota o fluxo `Adicionar ao Carrinho -> Efetivar Compra -> Pedido confirmado -> Treino` como arquitetura final, em substituicao ao fluxo atual `Demo Comprar -> BOUGHT {is_demo: true} -> Treino direto`. Mudancas-chave: (1) **carrinho** vive no `api-service` com persistencia em PostgreSQL (`Cart`/`CartItem`), nao mais no Neo4j; (2) `Adicionar ao Carrinho` nao cria edge no Neo4j; (3) recomendacao "Com Carrinho" e calculada **em memoria** pelo `ai-service` via novo endpoint `recommendFromCart(clientId, productIds[])`, que le os embeddings ja existentes no Neo4j, faz `meanPooling` (juntando com embeddings de pedidos reais previos do cliente, se houver) e chama `recommendFromVector`; (4) `Efetivar Compra` (`POST /carts/{clientId}/checkout`) cria `Order` real no `api-service`, sincroniza com Neo4j como `BOUGHT` real (sem `is_demo`) e dispara retrain assincrono; (5) `Esvaziar Carrinho` apenas zera o `Cart` no PostgreSQL — nao toca no Neo4j; (6) `is_demo` no Neo4j fica **deprecado** no fluxo principal e mantido apenas como feature flag de depuracao; (7) `ModelTrainer` deixa de mesclar `demoPairs` e treina somente com `orders`; (8) `computePrecisionAtK` volta a operar somente sobre pedidos confirmados, eliminando o train/eval mismatch sem precisar de `precisionAt5_full`.

**Reason:** O fluxo atual confunde `intencao` (carrinho/sessao) com `evento de treino` (pedido confirmado). Sistemas de recomendacao reais separam os dois; misturar esses sinais cria os problemas que o experimento `Distribuidora Central Sao Paulo` evidenciou (gap entre metrica e narrativa, `Com Demo` congelado, demos persistidas indefinidamente em Neo4j, opacidade na promocao do modelo). Embeddings de todos os produtos do catalogo ja existem no Neo4j pre-computados pelo `EmbeddingService` no seed/sync; portanto **nao e preciso gerar embedding novo no momento do `Adicionar ao Carrinho`** — basta consultar e fazer `meanPooling` em memoria. O Comite (5 personas: Professor Doutor em Engenharia de IA Aplicada, Professor Doutor em Deep Learning, Arquiteto de Solucoes IA, Staff de Engenharia, Arquiteto de Interface/UX React/Next.js) convergiu unanimemente nessa direcao por aproximar o MVP do mundo real e simplificar a narrativa pedagogica do projeto: `Sem IA -> Com IA -> Com Carrinho -> Pos-Efetivar (retreinado)`.

**Trade-off:** (1) Cada `Efetivar Compra` pode disparar retrain — em datasets pequenos isso causa custo e variancia; mitigacao via throttling/debounce ou gating por minimo de pedidos novos desde o ultimo treino. (2) Migracao: edges `BOUGHT {is_demo: true}` antigas no Neo4j precisam ser limpas ou ignoradas durante a transicao. (3) Frontend muda nome em varios pontos (`Demo Comprar` -> `Adicionar ao Carrinho`, `Limpar Demo` -> `Esvaziar Carrinho`, `Com Demo` -> `Com Carrinho`); demanda revisao consistente no catalogo, analysisSlice, demoSlice (a renomear), componentes e textos.

**Impact:** **`api-service`**: novos recursos `Cart`/`CartItem`, rotas `POST /carts/{clientId}/items`, `DELETE /carts/{clientId}/items/{productId}`, `DELETE /carts/{clientId}`, `POST /carts/{clientId}/checkout` (cria `Order` + dispara sync + retrain). **`ai-service`**: novo endpoint `recommendFromCart` que recebe `clientId` + `productIds[]`, le embeddings no Neo4j e chama `recommendFromVector`; remocao das rotas/logica de `is_demo` no caminho principal (ou mover para feature flag); `ModelTrainer.train` para de chamar `getAllDemoBoughtPairs` e nao mescla `demoPairs` em `clientOrderMap`; `computePrecisionAtK` volta a usar somente `orders`. **Frontend**: mini-cart fixo no topo com contagem + `Efetivar Compra`; `CatalogPanel`/`ProductCard` adotam `Adicionar ao Carrinho` + badge `no carrinho`; `analysisSlice` renomeia `phase: demo -> phase: cart`; `Com Demo` -> `Com Carrinho` reagindo a cada add/remove; `Pos-Retreino` so aparece apos `Efetivar Compra` + `done`. **Migracao de dados**: script para limpar/expirar edges `BOUGHT {is_demo: true}` legadas no Neo4j antes do go-live da nova arquitetura.

**Coverage after AD-043:** Base arquitetural de `M13`/`M14`/`M15` — `M13` implementa carrinho + checkout + retrain; `M14` cobre observabilidade/showcase; `M15` fecha integridade e UX comparativa restantes.

**Status:** Approved by Committee ✓ (5 personas, 2026-04-28). Supersedes AD-037, AD-038 e AD-041; partially supersedes AD-042 (ver notas abaixo). AD-039 (banda de tolerancia) e AD-040 (governanca 4-estados) seguem validos e independentes.

---

### AD-042: Comite — UX/observabilidade do showcase: scores em todo o catalogo + marca/categoria/deltas + snapshot `Com Demo` reativo (2026-04-28)

**Status:** Partially Superseded by AD-043 ⚠ — A parte de `score em todo o catalogo` e `marca/categoria nos cards` permanece valida e independente. As partes de `snapshot Com Demo reativo` e `deltas entre Com IA -> Com Demo -> Pos-Retreino` continuam validas mas com o vocabulario novo: `Com Carrinho` no lugar de `Com Demo`, e gatilho de `Pos-Retreino` passa a ser `Efetivar Compra + done` em vez de `Retreinar Modelo` manual.

**Decision:** O showcase passa a ter requisitos explicitos de UX/observabilidade aprovados pelo Arquiteto de Interface/UX (especialista em React/Next.js) e pelo Staff de Engenharia: (1) catalogo deve permitir ver score de **todos os itens visiveis** no modo "Ordenar por IA" (ou modo diagnostico equivalente); (2) cards de produto exibem `marca` e `categoria` de forma consistente em catalogo e detalhes; (3) tela de analise/detalhes mostra `posicao anterior`, `posicao nova` e `delta de score` entre `Com IA` -> `Com Demo` -> `Pos-Retreino`; (4) coluna `Com Demo` deve atualizar a cada nova compra demo, nao apenas no primeiro evento.

**Reason:** O experimento atual nao consegue ser interpretado com clareza porque o catalogo ordenado por IA so mostra score do top-10 (`limit: 10` em `useRecommendationFetcher.ts` e em `AnalysisPanel.fetchRecs`). Itens que "somem" do ranking sao indistinguiveis de itens que apenas sairam do top-10. Alem disso, a coluna `Com Demo` em `AnalysisPanel.tsx` so dispara quando `analysisPhaseRef.current === 'initial'`, congelando no primeiro evento e distorcendo a leitura de sessoes com multiplas compras demo acumuladas. O objetivo declarado do projeto e demonstrar o ciclo de melhoria com retreino — sem essa observabilidade, o showcase falha na hora mais critica (pos-retreino).

**Trade-off:** Solicitar score para todos os itens aumenta custo por request. Mitigacao: cap configuravel (ex.: `limit: 100` ou tamanho do catalogo) e/ou modo diagnostico ativavel apenas no showcase. Ajustar a logica do `analysisSlice` para reagir a cada `demoCount` exige cuidado para nao quebrar a maquina de estados `empty -> initial -> demo -> retrained` (ADR-029).

**Impact:** `useRecommendationFetcher.ts` (limit configuravel), `CatalogPanel.tsx`/`ProductCard.tsx` (exibicao consistente de score, marca, categoria), `AnalysisPanel.tsx`/`analysisSlice.ts` (snapshot `demo` reativo a cada compra; deltas entre fases), `RecommendationColumn.tsx` (delta visual). Avaliar nova rota/parametro `?fullCatalog=true` no `RecommendationService` para `recommend` e `recommendFromVector`.

**Coverage after AD-043:** `M14` cobre `score visibility`, `marca/categoria` e snapshot reativo agora como `Com Carrinho`; `M15` cobre o restante do polish comparativo. O fluxo legado `Com Demo -> Retreinar manual` foi cancelado.

**Status:** Approved by Committee ✓ (Arquiteto de Interface/UX + Staff de Engenharia + Arquiteto de Solucoes IA, 2026-04-28) — pendente `specify feature`

---

### AD-041: Comite — Validacao do contexto do cliente no `Demo Comprar` para preservar integridade do experimento (2026-04-28)

**Status:** Superseded by AD-043 ❌ — A validacao por pais migra naturalmente para `POST /carts/{clientId}/items` no `api-service`, que ja tem acesso ao `country` do cliente e ao `available_in` do produto. O caminho `is_demo` no Neo4j sai do fluxo principal, entao a validacao no `Neo4jRepository.createDemoBoughtAndGetEmbeddings` deixa de existir. O requisito funcional permanece (impedir adicionar produto fora do pais do cliente), mas a localizacao da regra muda.

**Decision:** O fluxo `POST /api/v1/demo-buy` deve validar a adequacao do produto ao contexto do cliente antes de criar a edge `BOUGHT {is_demo: true}` no Neo4j. No minimo: validacao por **pais do cliente** vs `available_in` do produto. Comportamento padrao: rejeitar com `422` quando o produto nao atende o pais; alternativa configuravel (`DEMO_BUY_STRICT_COUNTRY=false`) permite manter o comportamento atual para fins didaticos quando explicitado.

**Reason:** Hoje `createDemoBoughtAndGetEmbeddings` em `Neo4jRepository.ts` faz apenas `MATCH (c:Client {id})` + `MATCH (p:Product {id})` + `MERGE` da edge, sem checar `available_in`. Resultado observado: foi possivel comprar `Corona Extra` no cliente brasileiro mesmo o produto nao listando `BR`, contaminando `clientProfileVector` com sinal artificial. Como o objetivo e demonstrar aprendizado real do modelo a partir das compras, manter integridade minima do contexto e pre-requisito.

**Trade-off:** Adiciona uma validacao por request. Para o objetivo didatico, `DEMO_BUY_STRICT_COUNTRY=false` continua disponivel para mostrar o efeito de "ruido" no perfil do cliente.

**Impact:** `Neo4jRepository.createDemoBoughtAndGetEmbeddings` (ou nova checagem em `DemoBuyService`) + `demoBuyRoutes.ts` (codigo `422`/mensagem) + frontend (`CatalogPanel.tsx` desabilita `Demo Comprar` quando `product.countries` nao inclui `selectedClient.country`) + `.env.example` com `DEMO_BUY_STRICT_COUNTRY` (default `true`).

**Coverage after AD-043:** Fluxo original de `demo-buy` cancelado; o requisito funcional migra para `M15` em `POST /carts/{clientId}/items`.

**Status:** Approved by Committee ✓ (Staff de Engenharia + Arquiteto de Solucoes IA, 2026-04-28) — pendente `specify feature`

---

### AD-040: Comite — Governanca de modelo: separacao explicita entre `current/candidate/rejected` + transparencia operacional (2026-04-28)

**Decision:** O ciclo de vida do modelo passa a ter quatro estados explicitos e visiveis: `training` (job em execucao), `candidate` (modelo recem-treinado em avaliacao), `current` (modelo ativo servindo recomendacoes), `rejected` (modelo descartado pelo gate, com motivo). A UI de `ModelStatusPanel`/`AnalysisPanel` deve exibir, apos qualquer treino: qual modelo esta `current` agora, quando foi promovido, qual era o `candidate`, e — se rejeitado — o motivo (ex.: `precisionAt5` abaixo da banda de tolerancia, regressao de loss em datasets pequenos, etc).

**Reason:** Pelo experimento de hoje (cesta `beverages/Ambev` em `Distribuidora Central Sao Paulo`), o usuario nao consegue saber se: (a) o modelo novo foi promovido e esta ativo, (b) o modelo novo foi rejeitado e o antigo continua ativo, ou (c) houve regressao mas o modelo novo ainda assim virou `current`. O codigo atual em `ModelTrainer.train()` chama `this.modelStore.setModel(model, ...)` ANTES da decisao de promocao em `VersionedModelStore.saveVersioned()`, e este utiliza `_getCurrentPrecisionAt5()` lendo o status ja sobrescrito — risco real de aceitar regressao silenciosa. Sem observabilidade clara, a narrativa do projeto (demonstrar melhoria com retreino) se quebra exatamente no momento de decisao.

**Trade-off:** Refatorar a ordem de `setModel`/`saveVersioned` exige cuidado para nao quebrar `VersionedModelStore.test.ts` e o fluxo do `TrainingJobRegistry`. UI extra adiciona superficie a manter.

**Impact:** `VersionedModelStore.ts` (snapshot do `currentPrecisionAt5` ANTES de qualquer `setModel`; `setModel` so apos aceitacao), `ModelTrainer.train()` (deixar a promocao para o `TrainingJobRegistry`/`saveVersioned`), `TrainingJobRegistry._runJob` (refletir os 4 estados em `TrainingJob`), API de status (`/model/status` retorna `currentModel`, `lastCandidate`, `lastRejection`), frontend (`ModelMetricsComparison`, `ModelStatusPanel`).

**Coverage after AD-043:** `M13` — governanca `current/candidate/rejected`, payload de status expandido e visualizacao operacional na UI.

**Status:** Approved by Committee ✓ (Staff de Engenharia + Arquiteto de Solucoes IA + Professor Doutor em Deep Learning, 2026-04-28) — pendente `specify feature`

---

### AD-039: Comite — Promotion gate com banda de tolerancia + razao explicita (2026-04-28)

**Decision:** A promocao automatica do modelo deixa de usar comparacao estritamente `>=` em `precisionAt5` e passa a aplicar uma **banda de tolerancia** configuravel via env (`MODEL_PROMOTION_TOLERANCE`, default `0.02` nesse projeto didatico). Regra final pos-AD-043: aceitar `candidate` se `candidatePrecisionAt5 >= currentPrecisionAt5 - tolerance`, usando como metrica canonica o `precisionAt5` calculado somente sobre pedidos confirmados. Se uma bridge temporaria expuser `precisionAt5_full`/`precisionAt5_real` durante a migracao, o gate continua preso a metrica canonica do fluxo final.

**Reason:** Em datasets pequenos como o deste projeto, `precisionAt5` oscila bastante entre treinos com seed igual e variacao minima de dados. Comparacao estritamente `>=` cria dois problemas: (1) gate excessivamente rigido pode rejeitar modelos genuinamente melhores que tiveram regressao estatistica de ruido; (2) gate atual em `VersionedModelStore.saveVersioned()` aceita `==` e nao informa motivo, o que combinado com AD-040 cria opacidade. O Professor Doutor em Deep Learning aprovou a banda como mitigacao cientificamente correta para datasets pequenos.

**Trade-off:** Em producao com dataset grande, `tolerance` pode ser `0` (sem banda) e a banda volta a ser rigida. Por isso a configuracao via env.

**Impact:** `VersionedModelStore.saveVersioned()` (logica de aceitacao + razao registrada no historico), `getHistory()` (incluir `reason`), `model.ts` (`/model/status` expor `lastDecision: { accepted, reason, currentPrecisionAt5, candidatePrecisionAt5, tolerance }`), `ModelStatusPanel.tsx`/`ModelMetricsComparison.tsx` (rotulo `Aceito / Aceito com tolerancia / Rejeitado` + motivo).

**Coverage after AD-043:** `M13` — gate com tolerancia continua valido, mas a base de comparacao deixa de ser `precisionAt5_full` e volta para o `precisionAt5` canonico do fluxo com pedidos confirmados.

**Status:** Approved by Committee ✓ (Professor Doutor em Deep Learning + Arquiteto de Solucoes IA, 2026-04-28) — pendente `specify feature`

---

### AD-038: Comite — `precisionAt5_full` e `precisionAt5_real` como duas metricas paralelas + flag de avaliacao (2026-04-28)

**Status:** Cancelled for final architecture by AD-043 ❌ — Com AD-043, demos deixam de ser ground truth e o `ModelTrainer` passa a treinar somente com pedidos confirmados. `precisionAt5_full` deixa de ser necessario no fluxo final. A flag `EVAL_INCLUDE_DEMOS` permanece apenas como nota historica de migracao e nao deve ser implementada em `M13`/`M14`/`M15`.

**Decision:** Alem da inclusao de `demoPairs` no holdout (AD-037), o sistema passa a expor duas metricas separadas: `precisionAt5_full` (real ∪ demo) e `precisionAt5_real` (apenas pedidos reais). A metrica exibida na UI/`/model/status` enquanto demos forem ground truth oficial e `precisionAt5_full`. A alternancia e controlada por flag `EVAL_INCLUDE_DEMOS` (default `true` neste projeto). Quando o sistema for migrado para producao real, `EVAL_INCLUDE_DEMOS=false` e a metrica canonica volta a ser `precisionAt5_real`.

**Reason:** Manter as duas metricas elimina ambiguidade durante a transicao "demos como ground truth" -> "pedidos reais como ground truth". Permite comparar regimes sem perder historico. O Arquiteto de Solucoes IA recomendou a flag explicita, no estilo `is_demo: true`, para que a decisao seja rastreavel e nao inferida.

**Trade-off:** Calcular ambas as metricas custa duas passadas pelo `computePrecisionAtK` (com filtro adequado em cada). Aceitavel para o tamanho atual de dataset.

**Impact:** `ModelTrainer.computePrecisionAtK` parametrizado por `includeDemos: boolean` ou metodo separado; `TrainingResult` ganha `precisionAt5_full`/`precisionAt5_real`; `ModelStore`/`VersionedModelStore` propagam ambos; rota `/model/status` retorna ambos; UI exibe `precisionAt5_full` por default e expoe o outro como detalhamento.

**Coverage after AD-043:** Nenhuma cobertura planejada em `M13`/`M14`/`M15`. Reabrir apenas se a migracao real exigir uma bridge temporaria, o que hoje nao e o plano.

**Status:** Approved by Committee ✓ (Professor Doutor em Engenharia de IA Aplicada + Arquiteto de Solucoes IA, 2026-04-28) — pendente `specify feature`

---

### AD-037: Comite — `precisionAt5` deve incluir compras demo enquanto demos forem ground truth oficial (2026-04-28)

**Status:** Superseded by AD-043 ❌ — Com a adocao do fluxo `Carrinho -> Pedido confirmado -> Treino`, demos deixam de ser ground truth. `precisionAt5` volta a ser calculado **somente sobre pedidos confirmados**, eliminando o train/eval mismatch sem precisar incluir `demoPairs` no holdout. Esta decisao fica registrada como historica para explicar a transicao.

**Decision:** Enquanto o projeto operar com compras demo (`BOUGHT {is_demo: true}`) como unico ground truth de avaliacao do modelo, o `computePrecisionAtK` em `ModelTrainer.ts` deve considerar `pedidos reais ∪ demoPairs` na construcao do `clientOrderMap` usado para o split 80/20 do holdout. Hoje, `computePrecisionAtK` usa apenas `orders` (PostgreSQL) e ignora `demoPairs` (Neo4j), causando `train/eval mismatch`: o modelo e treinado em uma distribuicao (real ∪ demo) e avaliado em outra (so real).

**Reason:** O Professor Doutor em Engenharia de IA Aplicada (Sistemas de Recomendacao) e o Professor Doutor em Deep Learning convergiram que `train/eval mismatch` e um erro classico que invalida a metrica reportada. Como o objetivo declarado deste projeto e **demonstrar o ciclo de melhoria com retreino a partir de compras demo**, a metrica precisa enxergar o mesmo universo que o treino enxerga. Sem isso, a UI mostra `Regressao` mesmo quando o modelo melhorou para o experimento que o usuario acabou de executar — exatamente o oposto da narrativa pedagogica do projeto.

**Trade-off:** Clientes com poucas amostras (so demos e <2 compras) seguem filtrados por `allPurchased.length < 2`. Considerar elevar para `< 3` para reduzir variancia em cenarios com 1 demo isolada (registrar como `Todo` separado).

**Impact:** `ModelTrainer.ts` (`computePrecisionAtK` recebe `demoPairs` ja carregadas em `train()` antes do calculo), `TrainingResult.precisionAt5` passa a refletir o universo `real ∪ demo`, `VersionedModelStore.saveVersioned()` continua usando esse `precisionAt5` como gate (com banda — ver AD-039). Documentar mudanca no README sob "Why Precision@K, not Accuracy?".

**Status:** Approved by Committee ✓ (Professor Doutor em Engenharia de IA Aplicada + Professor Doutor em Deep Learning + Arquiteto de Solucoes IA, 2026-04-28) — pendente `specify feature`

---

### AD-036: M11 — protocolo de validacao usa cesta homogenea `snacks/Nestle` + veredito por self-consistency (2026-04-27)

**Decision:** Para validar se o retreino do M11 estava aprendendo pelo motivo certo, o protocolo oficial da sessao usou o cliente `Supermercado Familia BR` com cesta homogenea `Nestle Wafer Chocolate 3-pack`, `Nestle Baton Dark Chocolate 16g` e `Nestle Passatempo Cookies 130g`. O veredito foi definido por tres sinais em conjunto: (1) testes focais do dataset/negative sampling, (2) `precisionAt5` via `/model/status`, e (3) comportamento qualitativo das colunas `Com IA` -> `Com Demo` -> `Pos-Retreino`.

**Reason:** Um cluster homogeneo `mesma categoria + mesmo supplier` maximiza o sinal esperado dos ADR-031/032 e reduz a ambiguidade de interpretar queda/subida de itens apos compras demo e retreino.

**Trade-off:** O experimento entrega evidencia forte de consistencia interna, mas com generalizacao limitada porque cobre apenas um cliente e um cluster. Ainda vale repetir em um segundo cluster para ganhar confianca estatistica.

**Impact:** Artefatos salvos em `frontend/e2e/screenshots/manual-validation/`. Resultado observado: `trainingSamples` `1363 -> 1378` (+15 coerente com `3 x (1 positivo + 4 negativos)`), `precisionAt5` estavel em `0.6`, e itens correlatos do cluster subindo de `5/6/8/9` para `2/3/4/6`.

**Status:** Accepted ✓ (Validation protocol recorded)

---

### AD-033: M12 — StartupRecoveryService para self-healing do modelo no boot do AI Service (2026-04-27)

**Decision:** Introduzir `StartupRecoveryService` no `ai-service`, instanciado no `index.ts`, para orquestrar o recovery em background quando `VersionedModelStore.loadCurrent()` termina sem modelo carregado. O serviço: (1) verifica embeddings ausentes e reaproveita `embeddingService.generateEmbeddings()` quando necessario; (2) valida se existe dado minimo de treino; (3) reutiliza `TrainingJobRegistry.enqueue()` + `waitFor(jobId)` para disparar ou aguardar o treino; (4) bloqueia `/ready` ate que `versionedModelStore.getModel()` volte a ser nao-nulo. `AUTO_HEAL_MODEL=false` continua sendo o opt-out oficial para testes.

**Reason:** `docker compose up` apos perda do modelo ainda expõe `ModelNotTrainedError` ate intervençao manual. O projeto ja possui as pecas operacionais do recovery (embeddings + treino assíncrono + model store versionado); faltava um orquestrador de boot. A decisao preserva o caminho unico de treino assíncrono do M7, evita duplicar lifecycle em `index.ts` e cria um seam claro para testes unitarios e de startup. ADR-033.

**Trade-off:** M12 continua tratando ausencia de modelo, nao orquestraçao do seed. Se o ambiente estiver vazio porque o seed nunca rodou, o processo fica vivo, registra warning e mantem `/ready = 503` em vez de esconder a causa.

**Impact:** `StartupRecoveryService` + `index.ts` + `TrainingJobRegistry.waitFor()` + `.env.example`/`env.ts` (AUTO_HEAL_MODEL) + startup integration tests + compose `/ready` health contract. Feature M12 concluida e validada em cold/warm boot.

**Status:** Accepted ✓ (ADR-033)

---

### AD-034: M12 — `/ready` como probe operacional do ai-service sem ciclo de startup no Compose (2026-04-27)

**Decision:** O healthcheck do `ai-service` passa a usar `/ready`, com `start_period: 180s`, enquanto o `api-service` deixa de depender de `ai-service: service_healthy` e passa a depender apenas de o container estar iniciado (`service_started`). `/health` permanece liveness puro.

**Reason:** O auto-healing depende do `api-service` para buscar clientes, produtos e pedidos usados no treino. Se o Compose mantivesse `api-service` esperando o `ai-service` ficar saudável, e o `ai-service` ficasse saudável apenas quando `/ready = 200`, o boot entraria em ciclo. Ao mesmo tempo, manter o healthcheck em `/health` faria o Compose enxergar o serviço como pronto cedo demais. ADR-034 resolve as duas tensões com a menor mudança estrutural possível.

**Trade-off:** O `api-service` pode subir antes de o modelo do `ai-service` estar pronto, mas isso é aceitável porque o proxy Java já possui circuit breaker + fallback para indisponibilidade temporaria da IA.

**Impact:** `docker-compose.yml` (probe do ai-service + `depends_on` do api-service) + `design.md`/ADR-034 do M12.

**Status:** Accepted ✓ (ADR-034)

---

### AD-035: M12 — Retry limitado no probe de dados de treino para mitigar race de startup (2026-04-27)

**Decision:** `StartupRecoveryService` executa probe de dados de treino com retry limitado (`trainingDataProbeAttempts` + `trainingDataProbeDelayMs`) antes de concluir `blocked/no-training-data`.

**Reason:** Em boot frio do stack, `api-service` pode estar disponível parcialmente durante os primeiros segundos após o `listen()` do `ai-service`, retornando contagens transitórias (ex.: clientes/pedidos presentes e produtos ainda não visíveis), o que poderia bloquear readiness cedo demais.

**Trade-off:** Aumenta alguns segundos no pior caso de cold boot, mas evita falso negativo de prontidão sem introduzir loop infinito.

**Impact:** `StartupRecoveryService.ts` e configuração no `index.ts` para tentativa limitada de probe durante startup recovery.

**Status:** Accepted ✓ (M12 Execute)

---

### AD-032: M11 quick fix — Exclusão de Soft Negatives por Similaridade Coseno (ADR-032) (2026-04-27)

**Decision:** Adicionar segundo filtro de soft negatives em `buildTrainingDataset`: candidatos com `max(cosineSimilarity(candidateEmb, positiveEmb)) > SOFT_NEGATIVE_SIM_THRESHOLD` são excluídos do `negativePool`. Threshold configurável via `process.env.SOFT_NEGATIVE_SIM_THRESHOLD` (default `0.65`). Filtro aplicado após ADR-031 (categoria+supplier) — os dois são aditivos: um produto é excluído se satisfizer qualquer um dos dois critérios. `cosineSimilarity` implementada como função pura local.

**Reason:** ADR-031 cobre apenas mesma (categoria + supplier). Produtos food/Nestlé próximos de food/Unilever no espaço de embedding continuam no pool de negativos e recebem gradiente negativo residual (~5–15 pontos). A exclusão por similaridade coseno é equivalente ao que ANCE realiza em produção — matematicamente correta para eliminar False Negative Contamination independente de supplier. Debatido e aprovado por Comitê de IA (4 personas, 2026-04-27). ADR-032.

**Trade-off:** Introduz `SOFT_NEGATIVE_SIM_THRESHOLD` como hiperparâmetro novo. Mitigado por env var com default calibrado (0.65). Pool de negativos reduz adicionalmente (~3–8 produtos com 52 no catálogo) — compensado pelo `negativeSamplingRatio: 4`.

**Impact:** `training-utils.ts` (função `cosineSimilarity` + segundo filtro no loop) + `training-utils.test.ts` (testes de exclusão por similaridade).

**Status:** Accepted ✓ (ADR-032) — implementado; commit `38e1fd8`

---

### AD-031: M11 quick fix — Exclusão de Soft Negatives por Categoria+Supplier no negative sampling (2026-04-27)

**Decision:** Adicionar `supplierId?: string` ao `ProductDTO` em `training-utils.ts`. Em `buildTrainingDataset`, calcular o conjunto de "soft positive IDs" — produtos que compartilham (categoria + supplierId) com qualquer positivo do cliente mas que não foram comprados — e excluí-los do `negativePool`. Produtos sem `supplierId` não são excluídos (comportamento conservador). `supplierId` preenchido pelo `ModelTrainer` a partir do campo `supplierName` do `ProductSummaryDTO` retornado pelo endpoint `/api/v1/products`.

**Reason:** Observado em runtime: 3 compras demo food/Unilever causaram queda de score do Knorr Pasta Sauce de 64% → 32% após retreino — violação do objetivo do M11. Causa raiz: False Negative Contamination — produtos da mesma (categoria+supplier) com embedding próximo recebem gradiente oposto amplificado pelo `classWeight: {0:1, 1:4}`. Diagnóstico validado pelo Comitê de IA (4 personas, 2026-04-27). Prática equivalente ao "impression-based negatives" do YouTube (2016) e ao MNAR (Missing Not At Random) da literatura — padrão de produção, não artifício de demo. ADR-031.

**Trade-off:** Pool de negativos reduz (produtos soft-positive excluídos). Com 52 produtos e `negativeSamplingRatio: 4`, o impacto é negligível — hard negative mining já garantia diversidade de categoria.

**Impact:** `training-utils.ts` (ProductDTO + filtro softPositives) + `training-utils.test.ts` (novo teste) + `ModelTrainer.ts` (preencher `supplierId` no mapeamento de ProductSummaryDTO → ProductDTO).

**Status:** Accepted ✓ (ADR-031)

---

### AD-026: M10 — getAllDemoBoughtPairs + mescla no clientOrderMap para incluir demos no retreinamento (2026-04-26)

**Decision:** `Neo4jRepository.getAllDemoBoughtPairs()` retorna todos os pares `{clientId, productId}` de edges `BOUGHT {is_demo: true}` em uma query batch. `ModelTrainer.train()` chama este método após `fetchTrainingData()` e mescla os pares no `clientOrderMap` antes de construir os tensores — com `try/catch` non-fatal idêntico ao padrão de `syncNeo4j`.

**Reason:** `fetchTrainingData()` busca pedidos exclusivamente do PostgreSQL — edges demo no Neo4j eram invisíveis ao retreinamento. Comitê de Design (5 personas) convergiu em Node B (query batch) por menor pressão de I/O vs Node A (N queries por cliente) e por preservar o isolamento `is_demo:true` que sustenta o `clearAllDemoBought` do M9-A (descartando Node C). Staff Engineering e QA Staff (2 personas) confirmaram o filtro `WHERE r.is_demo = true` explícito como non-negotiable para evitar inclusão acidental de edges sem o atributo.

**Status:** Accepted ✓ (ADR-026)

---

### AD-025: M9-B — useRetrainJob com jobIdRef para evitar stale closure no setInterval (2026-04-26)

**Decision:** `useRetrainJob` usa `jobIdRef = useRef<string | null>(null)` sincronizado com `jobId` state via `useEffect([jobId])`. O callback do `setInterval` lê `jobIdRef.current` (sempre o valor mais recente) em vez do valor capturado na closure.

**Reason:** `setInterval` callback captura o `jobId` no momento de criação — stale closure. Se React batcheia updates, o callback lê `null`. Staff Engineering High severity no Phase 4 da Design Complex UI. Padrão documentado em React docs como "escape hatch" para closures de timers.

**Status:** Accepted ✓ (ADR-025)

---

### AD-024: M9-B — Progress bar via transform scaleX em vez de width (2026-04-26)

**Decision:** `TrainingProgressBar` anima o progresso via `transform: scaleX(fraction)` com `transform-origin: left` em uma div fill de `width: 100%`. Usa `motion-safe:transition-transform duration-300 ease-out`. Modo indeterminado: `animate-pulse` no fill.

**Reason:** Animar `width` aciona layout → paint → composite a cada poll update (thrashing). `transform` é GPU-composited — sem recálculo de layout. Staff UI Designer High severity no Phase 4. Consistente com AD-017 (ReorderableGrid só anima `transform`).

**Status:** Accepted ✓ (ADR-024)

---

### AD-023: M9-B — AnalysisPanel always-mounted para preservar estado do retrain entre tabs (2026-04-26)

**Decision:** `AnalysisPanel` renderizado incondicionalmente em `page.tsx`. Visibilidade via Tailwind `hidden`/`block`. Container recebe `aria-hidden={activeTab !== 'analysis'}` para remover elementos ocultos da árvore de acessibilidade.

**Reason:** Render condicional `{activeTab === 'analysis' && <AnalysisPanel />}` destrói `useRetrainJob` state ao sair da aba — viola M9B-22. Padrão always-mounted já estabelecido em AD-018 (RAGDrawer). Phase 3 Self-Consistency convergiu em Node C via dois caminhos independentes.

**Status:** Accepted ✓ (ADR-023)

---

### AD-020: M8 nav quick fix — Abas Cliente/Recomendações removidas; aba Análise criada (2026-04-26)

**Decision:** As abas "Cliente" e "Recomendações" foram removidas do `TabNav`. Uma nova aba "📊 Análise" foi criada fundindo: (1) `ClientProfileCard` lendo de `useSelectedClient()`; (2) comparação "Sem IA vs Com IA" (`ShuffledColumn` + `RecommendedColumn`) lendo de `useRecommendations()`. A aba "Chat RAG" foi mantida (duplica o drawer, mas preserva acessibilidade via teclado sem exigir interação com o header). `ShuffledColumn` foi migrada de `useClient()` (Context antigo) para `useSelectedClient()` (domain hook do M8).

**Reason:** Com o M8, o cliente é selecionado na navbar e o fluxo de recomendação vive no catálogo. A aba "Cliente" passou a ser um card estático sem ação. A aba "Recomendações" redirecionava o usuário para outra aba (link broken UX). Fundir ambas em "Análise" elimina o impasse, mantém o valor pedagógico da comparação lado a lado, e antecipa a estrutura já prevista no roadmap para o M9-B (Deep Retrain Showcase).

**Status:** Accepted ✓ (Parecer do Comitê — decisão de quick fix documentada em M8)

---

### AD-017: M8 — FLIP animation sem flushSync no ReorderableGrid (2026-04-26)

**Decision:** `<ReorderableGrid>` usa padrão `prevPositionsRef` com dois `useLayoutEffect` consecutivos para FLIP animation — sem `flushSync`. Snapshot "First" é capturado via ref antes do render; transforms são aplicados e removidos via `requestAnimationFrame` para criar dois frames visuais distintos. Apenas `transform` é animado (GPU-composited). `@media (prefers-reduced-motion)` suportado via `motion-safe:transition-transform`.

**Reason:** `flushSync` dentro de `useLayoutEffect` é anti-pattern React 18 — causa double-render em StrictMode e warnings no commit phase (Principal SW Architect, High severity). CSS Grid `order` não é animável. Animar `top`/`left` causa layout thrashing (Node B, Phase 2, High severity).

**Status:** Accepted ✓ (ADR-017)

---

### AD-018: M8 — RAGDrawer always-mounted para preservar histórico de chat (2026-04-26)

**Decision:** `<RAGDrawer>` é renderizado incondicionalmente no `Header` (always-mounted); visibilidade controlada via prop `open` do Radix `Sheet`. `isOpen` boolean é estado local do `Header`. Histórico de chat permanece em `useState` local do `RAGChatPanel` — sem elevação para o store global. Focus trap e `returnFocus` delegados ao Radix Sheet (não suprimir `onOpenAutoFocus`).

**Reason:** Conditional render `{isOpen && <RAGDrawer />}` destrói o estado do chat ao fechar — viola M8-41 diretamente (QA Staff, High severity). Elevar `chatHistory` para `demoSlice` violaria SRP do slice.

**Status:** Accepted ✓ (ADR-018)

---

### AD-019: M8 — Zustand slices + domain hooks substituem React Contexts (2026-04-26)

**Decision:** Três Zustand slices compostos em `useAppStore`: `clientSlice` (persist `smr-client`), `recommendationSlice` (volátil, `loading` no slice), `demoSlice` (volátil). Cross-slice dependency via `subscribe` no store init (não `useEffect` em componente). Domain hooks `useSelectedClient`, `useRecommendations`, `useCatalogOrdering`, `useRecommendationFetcher` abstraem o shape do store. Cache de recomendações limitado a 1 entrada (`cachedForClientId`). `tailwindcss-animate` instalado para keyframes do Sheet.

**Reason:** React Contexts não suportam `persist`, cross-slice dependency sem `useEffect` manual, nem crescimento de slices sem novos Providers. Zustand elimina Provider wrappers e entrega todas as features com 1/5 do boilerplate do Redux.

**Impact:** `layout.tsx` remove `<ClientProvider>` e `<RecommendationProvider>`. `useClient()` e `useRecommendations()` existentes continuam funcionando via domain hooks compatíveis. Risco de hydration flash com `persist` — mitigado via `skipHydration` + `rehydrate()` no `useEffect` do `Header`.

**Status:** Accepted ✓ (ADR-019)

---

### AD-021: M9-A — Transação unificada Neo4j para createDemoBought + getEmbeddings (2026-04-26)

**Decision:** `createDemoBoughtAndGetEmbeddings(clientId, productId)` (e variantes delete/clear) executam MERGE/DELETE e SELECT de embeddings na mesma `session.executeWrite()` — escopo transacional único. `session.executeWrite()` ativa retry automático do driver Neo4j em deadlocks.

**Reason:** Dois `session.run()` separados criam timing gap: o MATCH de embeddings pode rodar antes que o MERGE anterior tenha sido visível, produzindo `profileVector` sem a compra demo e feedback visual incorreto (Staff Engineering High severity; QA Staff cold start M9A-32).

**Status:** Accepted ✓ (ADR-021)

---

### AD-022: M9-A — DELETE /demo-buy usa path params em vez de request body (2026-04-26)

**Decision:** `DELETE /api/v1/demo-buy/:clientId/:productId` (individual) e `DELETE /api/v1/demo-buy/:clientId` (bulk) sem body. Frontend chama sem `Content-Type`.

**Reason:** DELETE com body é ignorado silenciosamente por proxies e gateways — causaria `clientId`/`productId` ausentes e 400s não rastreáveis (Staff Engineering Medium severity).

**Status:** Accepted ✓ (ADR-022)

---



**Decision:** A feature "Demo Buy + Live Reorder" (M9) opera exclusivamente no espaço do **clientProfileVector** (mean-pooling dos embeddings), não no espaço dos pesos da rede neural. Ao clicar "Demo Comprar", o ai-service: (1) cria edge `BOUGHT {is_demo: true}` no Neo4j via `syncBoughtRelationships()`; (2) relê os embeddings via `getClientPurchasedEmbeddings()`; (3) recalcula `meanPooling()` em memória; (4) chama `recommend()` existente com o novo profileVector. O `ModelTrainer` não é alterado. Latência estimada: 180–350ms.

**Reason:** Retreinamento completo dura ~2min — inviável para feedback ao vivo. O profile vector incremental entrega 95% do valor visual com 5% do risco. Online learning via `model.trainOnBatch()` foi avaliado pelo Comitê (Sessão 002, Caminho G) e rejeitado por risco de catastrophic forgetting + thread safety no Fastify. O Deep Retrain completo (Sprint B) foi separado como feature independente (M9-B) que usa `POST /model/train` existente com tela de progresso ao vivo.

**Trade-off:** A demo não modifica os pesos da rede — o efeito é visível apenas para o cliente selecionado na sessão. Para aprendizado que beneficia todos os clientes com perfil similar, o retrain completo (Sprint B) é necessário.

**Impact:** Nova rota `POST /api/v1/demo-buy` e `DELETE /api/v1/demo-buy` no ai-service. Novo método `clearDemoBought(clientId)` no Neo4jRepository. Flag `is_demo: true` nas edges BOUGHT demo para isolamento e limpeza.

**Status:** Accepted ✓ (ToT + Self-Consistency 87% — Comitê Ampliado Sessão 002)

---

### AD-012: M8/M9 — Arquitetura frontend unificada com Zustand + componente de reordenação reutilizável (2026-04-26)

**Decision:** As features M8 (UX Journey Refactor) e M9 (Demo Buy) compartilham duas fundações de código que devem ser implementadas em Sprint 0 antes de qualquer feature: (1) **Zustand store** com slices `selectedClient` (persistente na navbar) e `demoState` (lista de compras demo por clientId, limpa automaticamente ao trocar de cliente); (2) **componente `<ReorderableGrid>`** reutilizável que recebe scores como parâmetro e executa a animação CSS de reordenação. O M8 usa o componente via botão "✨ Ordenar por IA" na toolbar; o M9 usa o mesmo componente via botão "Demo Comprar" no card.

**Reason:** Sem estado global do cliente, nenhuma feature de recomendação funciona em contexto de página única. Sem componente reutilizável, a animação seria implementada duas vezes com risco de divergência visual. A análise de conflitos entre os documentos do Comitê (Sessão 001 vs Sessão 002) identificou estas três tensões: (T1) dois gatilhos para a mesma animação — resolvida com componente único; (T2) `demoState` deve ser limpo ao trocar `selectedClient` — dependência explícita entre slices; (T3) aba "Análise" absorve tanto a comparação "Sem IA vs Com IA" (M8) quanto o botão de Deep Retrain (M9-B) — layout interno a ser definido no design.md do M9.

**Trade-off:** Sprint 0 adiciona ~3h de setup antes de qualquer entrega visível. Justificado pela eliminação de retrabalho nos sprints seguintes.

**Impact:** `frontend/src/store/` com `clientSlice.ts` + `demoSlice.ts`. `frontend/src/components/ReorderableGrid/` como componente independente. Query params `?client=&ai=on` na URL para deep link e testes automatizados (sugestão do Arquiteto Rafael Alves, Sessão 001).

**Status:** Accepted ✓ (Análise de conflitos entre documentos — Sessão 002)

---

### AD-011: M7 Production Readiness — backlog formalizado como próximo milestone (2026-04-25)

**Decision:** Os gaps operacionais identificados na análise pós-M6 (GAP-01: cron diário de retreinamento, GAP-02: sincronização automática de produtos novos com Neo4j) e os achados do Comitê de Arquitetura (#5: model versioning, #6: 202 + polling, #10: segurança básica) foram formalizados como features do milestone M7 — Production Readiness. O ROADMAP foi atualizado: M6 marcado como COMPLETE, M7 como PLANNED.

**Reason:** Sem GAP-02 o sistema opera com produtos "invisíveis" para RAG e recomendações assim que qualquer produto novo é cadastrado. Sem GAP-01 o modelo se torna obsoleto silenciosamente sem alertas acionáveis. Ambos os gaps têm severidade Alta para produção. Os achados do Comitê (#5, #6, #10) são pré-requisitos para um deploy público seguro.

**Trade-off:** Adiamos event-driven (Kafka) e fine-tuning para "Future Considerations" — a Solução B do GAP-02 (cron de `generateEmbeddings` com `embedding IS NULL`) é mais simples, já idempotente, e elimina o gap sem dependências externas.

**Impact:** GAP-02 deve ser o primeiro item a executar no M7 — zero pré-requisitos. GAP-01 depende do Achado #6 (202 + polling) para não bloquear o event loop. Achado #5 (model versioning) deve andar junto com GAP-01 pois ambos tocam ModelStore/ModelTrainer.

---

### D-001 — TypeScript for AI Service instead of Python
**Date:** 2026-04-23
**Decision:** Use TypeScript (Node.js 22 / Fastify) for the AI service instead of Python/FastAPI.
**Rationale:**
- The entire post-graduation course (`Engenharia de Software com IA Aplicada`) is TypeScript-first, taught by Erick Wendel (Google Developer Expert, Node.js core contributor).
- `exemplo-13-embeddings-neo4j-rag` already validates the full stack: `@langchain/community`, `@xenova/transformers`, Neo4j vector store, OpenRouter via `@langchain/openai`. This is 60–70% of the AI service already working.
- `@xenova/transformers` (Transformers.js) provides HuggingFace local embeddings with no API cost in Node.js.
- `@tensorflow/tfjs-node` handles the neural model training for the complexity required by this MVP.
- Developer velocity: Gabriel has deep TypeScript expertise. Python would add friction without technical benefit at this scope.
- Portfolio coherence: fewer runtimes to configure (Node.js + JVM instead of Node.js + JVM + Python).
**Tradeoff accepted:** Python has richer ML tooling (Keras, scikit-learn, PyTorch). If model architecture needs to grow beyond a dense network, Python becomes the correct choice.
**Status:** Accepted ✓

### D-002 — Java 21 / Spring Boot 3.3 for API Service
**Date:** 2026-04-23
**Decision:** Use Java 21 with Spring Boot 3.3 for the domain API layer.
**Rationale:**
- Gabriel's primary expertise; existing GitHub projects demonstrate ultra-scale backend (100M RPM patterns).
- Positions the project for two audiences: AI recruiters (see the TypeScript AI service) and backend/platform recruiters (see the Spring Boot service).
- Spring Boot 3.3 + virtual threads (Project Loom) provides near-Go performance for I/O-bound workloads without reactive complexity.
- Springdoc OpenAPI auto-generates Swagger UI — zero effort for API documentation.
- Spring Actuator + Micrometer provides production-grade observability out of the box.
**Tradeoff accepted:** Adds JVM to the stack, increasing Docker image size and cold start time. Acceptable for portfolio; documented in README.
**Status:** Accepted ✓

### D-003 — Neo4j as unified Graph + Vector Store
**Date:** 2026-04-23
**Decision:** Use Neo4j 5.x Community as both the graph database (product relationships) and vector store (product embeddings), instead of separating vector DB (Pinecone/Weaviate) and graph DB.
**Rationale:**
- `exemplo-13-embeddings-neo4j-rag` validates this exact pattern: LangChain `Neo4jVectorStore` with `addDocuments` and `similaritySearchWithScore`.
- Neo4j 5.x native vector indexes eliminate the need for a separate vector database.
- Graph structure (`BOUGHT`, `BELONGS_TO`, `AVAILABLE_IN`) enables future graph-augmented retrieval (multi-hop Cypher) without changing infrastructure.
- Single service to manage in Docker Compose (simpler for reproducibility).
- Community Edition is free; no licensing cost.
**Tradeoff accepted:** Neo4j Community lacks clustering and enterprise backup. Irrelevant for portfolio scope.
**Status:** Accepted ✓

### D-004 — Synthetic dataset (no real data)
**Date:** 2026-04-23
**Decision:** Use a fully synthetic dataset generated by a seed script; optionally enrich product descriptions from Open Food Facts (public domain).
**Rationale:**
- No proprietary data risk (BEES, Ambev, Nestlé, etc.).
- Seed script is versionable, reproducible, and idempotent — evaluators always get the same state.
- Synthetic data can be engineered to produce clear recommendation signals (purchase patterns that make semantic sense), making the demo more impressive and predictable.
**Open question:** Whether to use Open Food Facts API for real product descriptions or keep descriptions fully synthetic. Leaning toward synthetic for full reproducibility.
**Status:** Accepted ✓

### D-005 — Hybrid scoring formula (0.6 neural + 0.4 semantic)
**Date:** 2026-04-23
**Decision:** Final recommendation score = `0.6 * neuralScore + 0.4 * semanticScore`. Weights configurable via environment variable.
**Rationale:**
- Neural score has higher weight because it incorporates purchase behavior (stronger signal for recommendation).
- Semantic score (cosine similarity of client profile embedding vs product embedding) handles cold-start and new products not yet in training data.
- Configurable weights allow demonstrating different behaviors in the README without code changes.
**Status:** Accepted ✓ (may be revised after M4 implementation and qualitative testing)

### D-006 — Separação EMBEDDING_MODEL / LLM_MODEL + troca para Llama 3.2 3B
**Date:** 2026-04-25
**Decision:** Separar a variável `NLP_MODEL` em duas: `EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2` (HuggingFace local, sem API key) e `LLM_MODEL=meta-llama/llama-3.2-3b-instruct:free` (OpenRouter inference).
**Rationale:**
- `NLP_MODEL` servia dois propósitos distintos — embedding local e LLM remoto — que têm requisitos e providers completamente diferentes.
- Llama 3.2 3B supera Mistral 7B em benchmarks (MMLU Pro 34.7% vs 24.5%, contexto 128K vs 32K) enquanto sendo menor (2GB VRAM vs 5GB).
- Separação permite trocar cada modelo independentemente via env var sem mudança de código (validado em `exemplo-13`).
**Tradeoff accepted:** Llama 3.2 3B tem throughput menor (53 tok/s vs 169 tok/s do Mistral). Aceitável para demo.
**Status:** Accepted ✓

### D-008 — Neo4j driver singleton com sessions por operação e try/finally
**Date:** 2026-04-23
**Decision:** Instanciar o `neo4j-driver` Driver uma vez no startup; injetar no `Neo4jRepository`; cada método abre/fecha session em `try/finally`.
**Rationale:** Evita overhead de conexão por request e leak de sessions em caso de exceção (Staff Engineering + Principal SW Architect — High severity no committee review do Design Complex M3).
**Status:** Accepted ✓ (ADR-004)

### D-009 — Model warm-up no startup + separação /health (liveness) e /ready (readiness)
**Date:** 2026-04-23
**Decision:** `EmbeddingService.init()` antes de `fastify.listen()`; `/health` responde imediatamente; `/ready` responde quando `modelReady === true`.
**Rationale:** `@xenova/transformers` download (~90MB) causaria latência de 30-60s no primeiro request; separação liveness/readiness evita que Docker marque container como healthy antes do modelo estar pronto (Staff Engineering High + QA Staff Medium no committee review).
**Status:** Accepted ✓ (ADR-005)

### D-010 — Estrutura modular de camadas para o AI Service
**Date:** 2026-04-23
**Decision:** `src/config/` → `src/repositories/` → `src/services/` → `src/routes/` → `src/index.ts`; rotas via `fastify.register` com prefixo `/api/v1`.
**Rationale:** Extensibilidade para M4 sem refactor; testabilidade por injeção de dependência via constructor; SRP cumprido por camada (Principal SW Architect High no committee review).
**Status:** Accepted ✓ (ADR-003)

### D-007 — Client profile vector = mean of purchased product embeddings
**Date:** 2026-04-23
**Decision:** Represent a client's taste profile as the element-wise mean of the HuggingFace embeddings of all products they have purchased.
**Rationale:**
- Avoids sparse one-hot encoding used in `parte05` (which treats category/color as independent features).
- Dense 384-dim representation captures semantic product characteristics.
- Simple to compute, interpretable, and effective for small-to-medium purchase histories.
- Directly enables cosine similarity between client profile and candidate product embeddings.
**Tradeoff accepted:** Mean pooling loses purchase frequency information. Weighted mean by purchase quantity is a noted improvement for future work.
**Status:** Accepted ✓

---

## Blockers

### B-001 — `precisionAt5` reportado nao reflete o objetivo pedagogico do projeto enquanto demos forem ground truth
**Discovered:** 2026-04-28
**Impact:** Alta — Bloqueia a narrativa "treinar com demo -> ver melhoria real" em todas as sessoes do showcase. UI marca `Regressao` mesmo quando o ranking local melhorou, e o gate de promocao em `VersionedModelStore.saveVersioned()` decide com base nessa metrica enviesada.
**Workaround:** Avaliar qualitativamente via colunas `Com IA` / `Com Demo` / `Pos-Retreino` e pelo movimento de itens correlatos do cluster comprado, em vez de confiar no `precisionAt5` exibido.
**Resolution (atualizado):** Resolvido pela arquitetura de AD-043 — com demos saindo do treino, `precisionAt5` volta a ser calculado somente sobre pedidos confirmados, eliminando o train/eval mismatch na raiz. Bloqueio fecha quando `M13 — Cart, Checkout & Async Retrain Capture` entregar a remocao de `demoPairs` no `ModelTrainer.train` + `computePrecisionAtK` somente sobre `orders`.

---

## Lessons Learned

### L-012 — Misturar `intencao` (carrinho) com `evento de treino` (pedido) cria gap entre metrica e narrativa
**Source:** Comite de Arquitetura/IA — sessao de 2026-04-28 (origem do AD-043)
- Sistemas de recomendacao reais separam **intencao do cliente em sessao** (carrinho, navegacao, click) de **evento de treino confirmado** (pedido). O MVP atual misturava os dois ao usar `BOUGHT {is_demo: true}` como entrada de treino e como sinal de intencao ao mesmo tempo.
- Os sintomas observados no experimento `Distribuidora Central Sao Paulo` foram todos consequencia desse acoplamento: gap entre `precisionAt5` (computado em `orders` reais) e o "uplift" visivel no ranking local; `Com Demo` congelando porque a intencao nao tem `Confirmar`; demos persistindo indefinidamente em `Neo4j` apos reload; opacidade na promocao do modelo porque o que deveria ser uma decisao explicita do usuario virou um efeito colateral de cada compra demo.
- Aprendizado: arquitetar primeiro **a separacao de eventos** (cart vs order), depois decidir o que treina. Embeddings de produto sao ortogonais a essa decisao e podem viver em qualquer dos dois lados (no projeto, ja vivem pre-computados no `Neo4j`, o que torna a transicao para AD-043 barata).

### L-011 — `precisionAt5` global pode cair enquanto a recomendacao local melhora
**Source:** Comite de Arquitetura/IA — sessao de 2026-04-28
- Em datasets pequenos como o do projeto (~20 clientes, 52 produtos), retreinar com forte sinal local de um cliente pode mover o modelo "para perto" desse cliente e degradar marginalmente o desempenho medio em outros clientes do holdout.
- Isso aparece como `precisionAt5` caindo (ex.: `0.6000 -> 0.5000`) enquanto o ranking ordenado por IA do proprio cliente passa a mostrar `2 beverages` no top-10 que antes nao apareciam.
- A leitura correta exige separar **qualidade global** (`precisionAt5`) de **uplift local** (movimento dentro do cluster comprado). Ambos sao validos, e nenhum sozinho conta a historia toda.

### L-010 — Reload da pagina nao limpa o backend; demos persistem como `BOUGHT {is_demo: true}` no Neo4j
**Source:** Experimento manual `Distribuidora Central Sao Paulo` (2026-04-28)
- O frontend persiste apenas `selectedClient` no `localStorage` (`partialize: (state) => ({ selectedClient: state.selectedClient })` em `store/index.ts`); `demoBoughtByClient` e estado de UI nao persistem.
- Apos `F5`, badges `demo` somem dos cards, mas as edges `BOUGHT {is_demo: true}` continuam no Neo4j ate uma chamada explicita de `Limpar Demo` (`clearAllDemoBought`).
- Consequencia operacional: continuar comprando "novos" beverages apos o reload e correto e cumulativo. Recomprar os mesmos itens que ja estao como demo nao adiciona sinal porque o treino colapsa por `Set` em `clientOrderMap`.

### L-009 — Catalogo "Ordenado por IA" so mostra score do top-10 e isso polui o diagnostico
**Source:** Experimento manual `Distribuidora Central Sao Paulo` (2026-04-28)
- `useRecommendationFetcher.ts` chama `/api/proxy/recommend` com `limit: 10`; `ProductCard` so renderiza `ScoreBadge` quando ha score no `scoreMap`.
- Itens fora do top-10 ficam sem badge mesmo no modo ordenado, dando a impressao de que "sumiram" do ranking quando na verdade so cairam para fora dos 10 com score reportado.
- Para experimentos de showcase, isso esconde justamente o que o avaliador quer ver: como itens correlatos do cluster comprado se movem fora do top-10. Mitigacao depende de `AD-042` (ver Decisions).

### L-008 — Coluna `Com Demo` congela na primeira compra demo de uma sessao
**Source:** Experimento manual `Distribuidora Central Sao Paulo` (2026-04-28)
- Em `AnalysisPanel.tsx`, o `useEffect` da Phase 2 so dispara quando `analysisPhaseRef.current === 'initial'`. Apos a primeira compra demo, a fase muda para `'demo'` e o efeito nao executa mais, mesmo que `demoBoughtByClient` mude.
- O `analysisSlice.captureDemo` reforca isso ao ignorar atualizacoes que nao venham de `phase: 'initial'`.
- Resultado observado: em sessoes com 2+ compras demo acumuladas (ex.: `Brahma Chopp` + `Brahma Zero`, depois mais 3 beverages), a coluna `Com Demo` reflete apenas o estado pos-1a-compra; as colunas `Com IA` -> `Com Demo` -> `Pos-Retreino` deixam de contar a historia real e levam a interpretacao errada do experimento.

### L-006 — Produtos comprados somem do ranking por design; o sinal correto e a subida de correlatos
**Source:** Validacao manual M11 — pesos `1:4` + negative sampling (2026-04-27)
- Os produtos comprados via demo podem desaparecer totalmente do ranking apos retreino sem que isso indique regressao.
- O `RecommendationService` exclui produtos ja comprados do conjunto de candidatos ao chamar `getCandidateProducts(country, purchasedIds)`.
- Na interpretacao do showcase, o criterio correto e observar se itens correlatos do mesmo cluster sobem ou se mantem fortes (`Nestle Classic`, `Nestle Chokito`, `Nestle Crunch`, `Nestle Charge`), e nao esperar que o item comprado continue recomendavel.

### L-007 — `trainingSamples` e uma heuristica rapida para provar que as compras demo entraram no treino
**Source:** Validacao manual M11 — pesos `1:4` + negative sampling (2026-04-27)
- Comparar `trainingSamples` antes/depois foi suficiente para validar que as compras demo participaram do retreino sem precisar instrumentacao adicional.
- No experimento, `trainingSamples` subiu de `1363` para `1378`, exatamente `+15`, consistente com `3 compras x (1 positivo + 4 negativos)`.
- Essa checagem funciona bem como sanity check operacional antes de analisar score ou ranking.

### L-001 — parte05 bugs to avoid
**Source:** Exploration of `exemplo-01-ecommerce-recomendations-z/parte05`
- `events.js` has duplicate `onProgressUpdate` static method — second overrides first. Avoid duplicate event names in the new AI service.
- `clearAll()` called without `await` in `exemplo-13` creates race condition with `addDocuments`. Always `await` Neo4j operations sequentially in the seed script.
- `tf.dispose()` and `tf.tidy()` missing in `parte05` worker — causes memory growth on repeated training. Apply in `@tensorflow/tfjs-node` training loop.
- README port mismatch (8080 vs 3000) in `parte05`. Keep README in sync from day one.

### L-003 — M1 Infrastructure Lessons
**Source:** M1 Execute phase
- Neo4j 5.x image does NOT support auto-execution of Cypher init scripts via volume mount (unlike PostgreSQL's `/docker-entrypoint-initdb.d/`). The entrypoint tries to `chown` mounted directories and fails if they are read-only. Solution: apply constraints via the seed script using `CREATE CONSTRAINT IF NOT EXISTS`.
- Alpine-based Docker health checks: `wget -qO- http://localhost:PORT` fails in some containers because `localhost` doesn't resolve. Always use `127.0.0.1` explicitly in Docker health check commands.
- Next.js standalone mode binds to the container's network IP by default, not `0.0.0.0`. Set `HOSTNAME=0.0.0.0` in the Dockerfile ENV to make it accessible via `127.0.0.1` inside the container.
- Order seed data must use deterministic UUIDs (e.g., `uuid/v5` with a stable namespace) to guarantee idempotency across re-runs. `uuid/v4` generates random IDs that defeat `ON CONFLICT (id) DO NOTHING`.
- Port conflicts on developer machines: use non-standard host port mappings (e.g., `5433:5432`) with a `POSTGRES_HOST_PORT` env var to avoid conflicts with other running PostgreSQL instances.

### L-005 — Next.js 14 fetch cache em Route Handlers quebra polling de jobs assíncronos
**Source:** Bug fix — botão Retreinar preso (2026-04-26)
- Next.js 14 faz cache agressivo de respostas de `fetch()` em Route Handlers por padrão. Qualquer proxy de polling que não declare `cache: 'no-store'` congela a primeira resposta recebida e a repete indefinidamente.
- Sintoma: `POST /model/train` retornava `202 queued`, mas os polls subsequentes via proxy sempre retornavam o primeiro estado capturado (`running` sem epoch), nunca avançando para `done`. O backend treinava corretamente — o bug era exclusivamente no cache do proxy.
- Fix: adicionar `cache: 'no-store'` em todos os `fetch()` dentro de Route Handlers que servem dados mutáveis ou em tempo real (`/api/proxy/model/train/status/[jobId]`, `/api/proxy/model/status`, `/api/proxy/model/train`).
- Regra geral: qualquer proxy Next.js → serviço externo que retorna dados que mudam por request deve ter `cache: 'no-store'` explícito.

### L-004 — Next.js 14 ESLint version requirements
**Source:** M5 Execute — `npm run lint` setup
- `next lint` with Next.js 14 requires ESLint 8, NOT ESLint 9. Installing the latest `eslint` package pulls in ESLint 9 which causes incompatible CLI options errors.
- Always install `eslint@8` + `eslint-config-next@{NEXT_VERSION}` (pinned to exact Next.js version) together.
- `npx shadcn@latest init` is interactive and cannot be used with `--yes` alone; manually creating `components/ui/` files + `lib/utils.ts` with `clsx`/`tailwind-merge` is the reliable alternative.
- For Next.js 14 with Radix UI: install `@radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-select` directly; no additional shadcn CLI needed.

### L-002 — langchain import path in exemplo-13
**Source:** Exploration of `exemplo-13-embeddings-neo4j-rag`
- `RecursiveCharacterTextSplitter` imported from `langchain/text_splitter` but `langchain` (bare package) is not in `package.json` — may rely on transitive dependency. In the new AI service, import from `@langchain/textsplitters` (explicit scoped package) to avoid ambiguity.

---

## Todos

- [x] **Pos-Comite 2026-04-29 (AD-054) — `specify feature` (M16):** `spec.md` criado em `.specs/features/m16-neural-first-didactic-ranking-catalog-density/spec.md` com 38 requisitos (`NFD-01..NFD-38`) cobrindo cooldown de compras recentes, painel `Compras recentes`, badges de elegibilidade, separacao `Vitrine x Ranking IA`, bloco "o que mudou no modelo" e seed/dataset mais denso por categoria.
- [x] **Pos-Comite 2026-04-29 (AD-054) — `design feature` (M16):** `design.md` aprovado; desenho técnico e ADRs 055–061 executados no código.
- [x] **Pos-Comite 2026-04-29 (AD-054) — Re-baseline do dataset/metricas:** aceite como concluído para fecho M16 (T15 / `precisionAt5` e auxiliares conforme processo acordado no repositório).
- [x] **Pos-Comite 2026-04-29 (AD-054) — `execute` / fecho M16:** código + testes (`tasks.md` T1–T15); ADR-061 no caminho checkout→Neo4j.
- [x] **`plan feature` P1 — M4 recência (ADR-062):** milestone **M17** no `ROADMAP.md` + pasta `.specs/features/m17-phased-recency-ranking-signals/spec.md`. **P1 + ADR-063/064** entregues ([tasks M17](../features/m17-phased-recency-ranking-signals/tasks.md)). **Seguinte no milestone:** **M17 P2** / **P3** — ver fila [AD-056](#state-ad-056) e [spec M17](../features/m17-phased-recency-ranking-signals/spec.md).
- [x] **`plan feature` P2 — AD-055 catálogo / payload:** milestone **M18** no `ROADMAP.md` + pasta `.specs/features/m18-catalog-simplified-ad055/spec.md`. **`specify feature` ✅** — requisitos `CSL-01..CSL-11`, reconciliação `NFD-*`. **`design.md` ✅** — [design](../features/m18-catalog-simplified-ad055/design.md). **`tasks.md` ✅** — [tasks](../features/m18-catalog-simplified-ad055/tasks.md) (T1…T9). **`execute` ✅** — T1…T9; E2E `m18-catalog-ad055.spec.ts`; ADR-055/056/058. Ver [AD-055](#state-ad-055) e [AD-056](#state-ad-056).
- [x] **Pos-Comite 2026-04-28 (AD-043/044/045) — `plan features`:** roadmap reorganizado em torno do fluxo `Carrinho -> Pedido -> Treino` + ancora visual `ModelStatusPanel`. Proximos milestones: **M13 — Cart, Checkout & Async Retrain Capture** | **M14 — Catalog Score Visibility & Cart-Aware Showcase** | **M15 — Cart Integrity & Comparative UX**. `ROADMAP.md` atualizado e features marcadas como `PLANNED`.
- [x] **Pos-Comite (AD-043/044/045) — `specify feature` (M13):** "Cart, Checkout & Async Retrain Capture". 68 reqs (CART-01..CART-68). Frequencia de retrain decidida como `every_checkout` no MVP. `spec.md` criado em `.specs/features/m13-cart-checkout-async-retrain/spec.md`.
- [x] **Pos-Comite (AD-043/044/045/046) — `task feature` (M13):** `tasks.md` do M13 foi realinhado ao design final (arquitetura + UI). Plano agora contem 20 tarefas com `CartSummaryBar`, semantica real de `TabNav`, acessibilidade/motion, queue semantics + `afterCommit`, gates `build` ao fim de cada fase e E2E final `m13-cart-async-retrain`.
- [x] **Pos-Comite (AD-043/044/045/046) — `design complex UI` (M13):** passada complementar de UI aplicada sobre o design do M13; `design.md` promovido para `Approved` com `Interaction States`, `Animation Spec`, `Accessibility Checklist`, findings adicionais de `Staff Product Engineer` + `Staff UI Designer`, e ADR-046 (`Responsive Cart Summary Bar`).
- [x] **Pos-Comite (AD-043/042) — `specify feature` (M14):** "Catalog Score Visibility & Cart-Aware Showcase". `spec.md` criado em `.specs/features/m14-catalog-score-visibility-cart-aware-showcase/spec.md` com 43 requisitos (`SHOW-01..SHOW-43`) cobrindo scores em toda a grade relevante, timeline `Com Carrinho` reativa, deltas comparativos, migracao de vocabulário do fluxo principal e cap/modo diagnostico explicito.
- [x] **Pos-Comite (AD-043/041/042/044/045) — `specify feature` (M15):** "Cart Integrity & Comparative UX". `spec.md` criado em `.specs/features/m15-cart-integrity-comparative-ux/spec.md` com 30 requisitos (`INTEG-01..INTEG-30`) cobrindo validacao por pais no carrinho, enriquecimento real do `ClientProfileCard` e polish final dos estados `promoted/rejected/failed/unknown`.
- [ ] **Pos-Comite (AD-043) — Migracao de dados:** definir e executar script para limpar/ignorar edges `BOUGHT {is_demo: true}` legadas no Neo4j antes do go-live da nova arquitetura. Documentar no `STATE.md` quando concluido.
- [x] **Resolvido — Renomear vocabulario no frontend:** `Demo Comprar` -> `Adicionar ao Carrinho`, `Limpar Demo` -> `Esvaziar Carrinho`, `Com Demo` -> `Com Carrinho`, `demoSlice` -> `cartSlice`. O fluxo principal foi migrado e os restos legados de frontend ligados a `demo` foram removidos na reconciliacao de 2026-04-29.
- [x] **Resolvido — `RetrainPanel -> ModelStatusPanel`:** imports, testes E2E e referencias principais foram migrados para a ancora visual final do fluxo pos-checkout.
- [x] **Resolvido — `useRetrainJob -> useModelStatus`:** fonte de verdade trocada de `jobId` para `version`, preservando polling e integracao com `/model/status`.
- [x] **Resolvido — Botao "Retreinar Modelo" no modo `Avancado`/`modo demo`:** retrain manual permanece como affordance secundaria de diagnostico dentro do `ModelStatusPanel`, fora do fluxo principal de carrinho/checkout.
- [x] **Resolvido — Frequencia de retrain pos-checkout (gray area):** decisao final registrada no `spec.md` do M13 como `every_checkout`; `POST /carts/{clientId}/checkout` retorna `expectedTrainingTriggered: true` para carrinho nao-vazio no MVP.
- [ ] **Pos-Comite (AD-043) — Avaliar elevar `allPurchased.length < 2` para `< 3`** em `computePrecisionAtK` para reduzir variancia em clientes com 1 pedido isolado (sugestao do Professor Doutor em Deep Learning, originalmente sob AD-037). Tratar como sub-task do `specify feature` de `M13`.
- [ ] **Pos-Comite (AD-043) — Documentar no README** a nova arquitetura `Carrinho -> Pedido -> Treino`, removendo a nota sobre `precisionAt5_full`/`EVAL_INCLUDE_DEMOS` (AD-037/AD-038 estao superseded) e explicando que `precisionAt5` agora reflete apenas pedidos confirmados.
- [ ] Repetir o protocolo de validacao M11 com um segundo cluster homogeneo (`personal_care/Unilever` ou `beverages/Nestle`) para tentar converter o resultado de `sucesso parcial` em `sucesso forte`
- [x] **M11 quick fix (ADR-031):** `supplierId?: string` adicionado ao `ProductDTO`; filtro soft negatives em `buildTrainingDataset` (exclusão de categoria+supplierName); 2 novos testes unitários; ESLint ✓; 74/74 Vitest ✓. Commit: `fix(ai-service): exclude soft negatives by category+supplier to prevent gradient interference (ADR-031)`
- [x] **M11 quick fix (ADR-032):** `cosineSimilarity` pura adicionada a `training-utils.ts`; filtro `softPositiveIdsBySimilarity` (threshold via `SOFT_NEGATIVE_SIM_THRESHOLD`, default 0.65) aplicado após ADR-031; 2 novos testes (exclusão por cosine + threshold=1.0 desabilitado); ESLint ✓; 76/76 Vitest ✓. Commit: `fix(ai-service): add cosine similarity soft negative filter to complement ADR-031 (ADR-032)`
- [x] **Specify M12:** `spec.md` criado para Self-Healing Model Startup (12 reqs, M12-01..M12-12)
- [x] **Design M12:** `design.md` criado + ADR-033 (`StartupRecoveryService`) + ADR-034 (`/ready` probe + compose startup cycle); proximo: tasks
- [x] **Tasks M12:** `tasks.md` criado (T1..T6) com dependências, gates e traceability 12/12
- [x] **Execute M12:** T1..T6 concluídas; `TrainingJobRegistry.waitFor()`, `StartupRecoveryService`, `AUTO_HEAL_MODEL`, bootstrap testável (`startup.test.ts`), compose `/ready` + `start_period: 180s`, build gate (`lint + build + test`) e validação cold/warm boot com recomendações funcionando sem chamada manual de geração/treino
- [x] Specify M1 features (monorepo structure, seed, Neo4j schema) — spec.md created (28 reqs, M1-01..M1-28)
- [x] Design complex M1 — design.md + ADR-001 (seed strategy) + ADR-002 (Neo4j healthcheck) created
- [x] Break M1 into tasks — tasks.md created (21 tasks, 6 phases, 28/28 reqs mapped)
- [x] Execute M1 — all 21 tasks complete, all 5 services healthy, seed idempotent, 28/28 requirements met
- [x] Specify M2 features (Spring Boot API endpoints)
- [x] Execute M2 — 45 Java classes implemented (controllers/services/repositories/entities/config/exception), OpenAPI + Actuator + cache + recommendation fallback validated via runtime smoke tests
- [x] Specify M3 features (AI service embedding + RAG) — spec.md created (37 reqs, M3-01..M3-37)
- [x] Design complex M3 — design.md + ADR-003 (estrutura modular) + ADR-004 (driver singleton) + ADR-005 (warm-up + liveness/readiness) criados; 3 nós ToT, committee review com 3 personas, 6 findings incorporados
- [x] Break M3 into tasks — tasks.md (13 tasks, T0..T13)
- [x] Execute M3 — 13 tasks complete, tsc --noEmit clean, all 37 requirements met
- [x] Specify M4 features (neural model + hybrid recommendation) — spec.md criado (34 reqs, M4-01..M4-34)
- [x] Design complex M4 — design.md + ADR-006 (ModelStore atomic swap) + ADR-007 (batch predict tensor strategy) + ADR-008 (tf.tidy async boundary) criados; 3 nós ToT, committee review com 3 personas, 7 findings incorporados
- [x] Break M4 into tasks — tasks.md (9 tasks, T1..T9)
- [x] Execute M4 — 9 tasks complete, tsc --noEmit clean, 34/34 requirements verified ✅ COMPLETE
- [x] Specify M5 features (Next.js frontend) — spec.md criado (33 reqs, M5-01..M5-33)
- [x] Design M5 — design.md + ADR-001..ADR-004 criados
- [x] Break M5 into tasks — tasks.md (40 tasks, 8 phases, 33/33 reqs mapped)
- [x] Execute M5 — 40 tasks complete, `npm run build` ✓, `npm run lint` ✓ zero warnings, 33/33 requirements met
- [x] Specify M6 features (tests + README) — spec.md criado (35 reqs, M6-01..M6-35)
- [x] Design complex M6 — design.md + ADR-009 (Vitest DI mocking) + ADR-010 (xenova pre-download builder stage) + ADR-011 (Next.js standalone Dockerfile) criados; 3 nós ToT, committee review com 3 personas, 9 findings incorporados
- [x] Break M6 into tasks — tasks.md (19 tasks, 7 phases, 55+ reqs mapped)
- [x] Execute M6 — 19 tasks complete; 19 AI service tests (Vitest); 15 Java unit tests (JUnit 5); Testcontainers IT tests; multi-stage Dockerfiles; ai-model-data volume; bilingual README; CONTRIBUTING; ESLint ✓; Checkstyle ✓ 0 violations; M6 ✅ COMPLETE
- [x] Specify M7 features (production readiness) — spec.md criado (36 reqs, M7-01..M7-36); 5 features (GAP-02, async train, cron GAP-01, model versioning, security + E2E)
- [x] Design complex M7 — design.md + ADR-012 (TrainingJobRegistry) + ADR-013 (VersionedModelStore) + ADR-014 (admin key scoped plugin) + ADR-015 (AiSyncClient fire-and-forget) criados; 3 nós ToT, committee review com 3 personas, 8 findings incorporados
- [x] Break M7 into tasks — tasks.md criado (21 tarefas, 8 fases, 37/37 reqs mapeados); Granularity ✅, Diagram-Definition ✅, Test Co-location ✅
- [x] Execute M7 — 21 tasks complete; 42 AI service tests (Vitest: 19 existing + 23 new); 16 Java tests; ESLint ✓; Checkstyle 0 violations; Playwright E2E suite (search, recommend, rag); VersionedModelStore, TrainingJobRegistry, CronScheduler, adminRoutes, sync-product, AiSyncClient all implemented; M7 ✅ COMPLETE
- [x] Specify M8 — UX Journey Refactor (página única, client selector na navbar, "Ordenar por IA", RAG side drawer) — spec.md criado (55 reqs, M8-01..M8-55)
- [x] Design complex UI M8 — design.md (Approved) + ADR-017 (FLIP sem flushSync) + ADR-018 (RAGDrawer always-mounted) + ADR-019 (Zustand slices + domain hooks); 5 personas; 3 High findings incorporados
- [x] Break M8 into tasks — tasks.md criado (14 tarefas, 6 fases, 55/55 reqs mapeados); Granularity ✅, Diagram-Definition ✅, Test Co-location ✅
- [x] Execute M8 — 14 tasks complete; Zustand store (3 slices) + 4 domain hooks + ReorderableGrid (FLIP ADR-017) + ClientSelectorDropdown + RAGDrawer (always-mounted ADR-018) + ScoreBadge + CatalogPanel toolbar + Header wiring + layout.tsx Providers removed + ClientPanel read-only + RecommendationPanel banner + sonner toasts + E2E m8-ux-journey.spec.ts; `npm run build` ✓; ESLint ✓ 0 warnings; M8 ✅ COMPLETE
- [x] M8 nav quick fix — abas Cliente/Recomendações removidas; nova aba Análise (ClientProfileCard + comparação Sem IA vs Com IA); ShuffledColumn migrada para useSelectedClient; antecipa estrutura prevista no M9-B; `npm run build` ✓; ESLint ✓
- [x] Specify M9-A — Demo Buy + Live Reorder (profile vector incremental, nova rota demo-buy) — spec.md criado (33 reqs, M9A-01..M9A-33); 3 rotas mapeadas; componentes existentes reutilizáveis identificados; latência estimada 160–230ms
- [x] Design Complex M9-A — design.md (Approved) + ADR-021 (write transaction unificada Neo4j) + ADR-022 (DELETE path params); DemoBuyService + recommendFromVector() + 3 métodos Neo4jRepository; demoSlice loading state; 4 committee findings incorporados; 3 ToT nodes; committee review 3 personas
- [x] Break M9-A into tasks — tasks.md criado (9 tarefas, 4 fases, 33/33 reqs mapeados); Granularity ✅, Diagram-Definition ✅, Test Co-location ✅
- [x] Execute M9-A — 9 tasks complete; DemoBuyService + recommendFromVector + Neo4jRepository (createDemoBoughtAndGetEmbeddings, deleteDemoBoughtAndGetEmbeddings, clearAllDemoBoughtAndGetEmbeddings) + demoBuyRoutes (ADR-022) + demoSlice loading state + ProductCard demo buttons/badge + CatalogPanel wiring (handlers + Limpar Demo toolbar) + 3 Next.js proxy routes + E2E m9a-demo-buy.spec.ts; ClientNotFoundError moved to Neo4jRepository; 63 AI tests (Vitest); `npm run build` ✓; ESLint ✓ 0 warnings; `tsc --noEmit` ✓; M9-A ✅ COMPLETE
- [x] Specify M9-B — Deep Retrain Showcase — spec.md criado (32 reqs, M9B-01..M9B-32); 6 stories P1/P2/P3; 4 novos componentes (RetrainPanel, TrainingProgressBar, ModelMetricsComparison, useRetrainJob); 0 mudanças de backend; layout integrado na aba "Análise"
- [x] Design M9-B — design.md (Approved) + ADR-023 (AnalysisPanel always-mounted) + ADR-024 (progress bar scaleX) + ADR-025 (jobIdRef stale closure); 3 proxy routes; lib/adapters/train.ts; 8 committee findings incorporados
- [x] Break M9-B into tasks — tasks.md criado (9 tarefas, 4 fases, 32/32 reqs mapeados); Granularity ✅, Diagram-Definition ✅, Test Co-location ✅
- [x] Execute M9-B — 9 tasks complete; lib/types.ts (5 tipos M9-B) + lib/adapters/train.ts + 3 proxy routes + useRetrainJob hook (ADR-025 jobIdRef, polling backoff, circuit-breaker 3 erros) + TrainingProgressBar (ADR-024 scaleX) + ModelMetricsComparison + RetrainPanel + AnalysisPanel lg:grid-cols-2 + mobile Tabs + page.tsx always-mounted ADR-023 + E2E m9b-deep-retrain.spec.ts; npm run build ✓; ESLint ✓ 0 warnings; M9-B ✅ COMPLETE
- [x] M10 — Demo-Retrain Integration — Neo4jRepository.getAllDemoBoughtPairs() + ModelTrainer mescla demos no clientOrderMap (ADR-026); compras demo feitas antes do retreinamento agora participam do tensor de treino
- [x] Break M11 into tasks — tasks.md criado (8 tarefas, 4 fases, 27/27 reqs mapeados); Granularity ✅, Diagram-Definition ✅, Test Co-location ✅
- [x] Execute M11 — 8/8 tasks complete; training-utils.ts (buildTrainingDataset + hard negative mining N=4 + seed LCG + upsampling fallback + 9 unit tests) + ModelTrainer (Dense[64, relu, l2(1e-4)]→Dropout[0.2]→Dense[1], EPOCHS=30, BATCH_SIZE=16, early stopping patience=5, seedFromClientIds, ADR-027/028) + analysisSlice.ts (4-phase discriminated union: empty|initial|demo|retrained, 4 actions, ADR-029) + RecommendationColumn.tsx (empty/loading/populated, colorScheme gray/blue/emerald/violet, capturedAt, fade-in animation, ADR-030) + AnalysisPanel (snapshot orchestration: captureInitial/captureDemo/captureRetrained via useEffect chains, xl:grid-cols-4 + md:grid-cols-2 + accordion + mobile stacked, lifted useRetrainJob shared with RetrainPanel) + RetrainPanel (disabled when phase=empty, M11-26, optional retrainJob prop) + useAppStore (analysisSlice composed, resetAnalysis() encadeado no setSelectedClient, ADR-029) + E2E m11-ai-learning-showcase.spec.ts (7 testes: initial/demo/retrain/disable/reset/accordion/mobile); ESLint ✓ 0 warnings; npm run build ✓; 72 AI tests (Vitest); M11 ✅ COMPLETE

---

## Deferred Ideas

- **SSE/WebSocket para eventos do modelo (`/model/events`) (Comite AD-045 — 2026-04-28):** Avaliada como Opcao 3 do mecanismo de captura da coluna `Pos-Efetivar` e rejeitada para o MVP por exigir nova infra de transporte (SSE ou WebSocket no `ai-service`/`api-service`) com beneficio nao-proporcional ao custo no escopo atual. O Staff observou que o polling em `/model/status` (Opcao 2 escolhida) ja desacopla a UI de filas de jobs e sobrevive a reload sem custo extra. Endereca-se em producao real, quando: (1) houver multiplos clientes simultaneos esperando retrain (custo cumulativo de polling vira relevante); (2) o `ai-service` precisar emitir outros eventos alem de promocao de modelo (ex: `embedding.synced`, `cart.checkout.failed`); (3) houver requisito de latencia sub-segundo na atualizacao da UI. Severidade: Baixa para MVP. Pre-condicao: AD-045 implementado e validado em producao demo.

- **Endpoint `recommendFromCandidate` para mostrar "o que teria acontecido" quando o candidato e rejeitado (Comite AD-045 Opcao 3b — 2026-04-28):** Quando o `promotion gate` (AD-039/AD-040) rejeita o modelo `candidate`, a coluna `Pos-Efetivar` reusa as recs do `current` (Opcao 3a escolhida) com banner ambar explicando a rejeicao. Pedagogicamente isso e "sem efeito visivel" — o avaliador nao consegue ver o que o modelo candidato teria recomendado. Solucao deferida: novo endpoint `POST /recommendations/candidate` que serve as recomendacoes do `candidate` sem promove-lo, permitindo a UI mostrar duas sub-colunas em `Pos-Efetivar` ("Modelo atual mantido" + "Candidato rejeitado teria mostrado"). Aumenta o valor pedagogico do showcase ao custo de carregar o `candidate` em memoria simultaneamente ao `current`. Severidade: Baixa. Pre-condicao: AD-040 implementado (separacao explicita de `current/candidate` no `VersionedModelStore`).

- **Remoção de `spring-boot-starter-webflux` do api-service:** `AiSyncClient` foi reescrito com `java.net.http.HttpClient` (ADR-015 revisado). Resta `AiServiceClient.recommend()` como único consumidor do `WebClient`. Reescrevê-lo com `java.net.http.HttpClient` eliminaria o `spring-boot-starter-webflux` do classpath, removendo o Netty como dependência transitiva e reduzindo o modelo mental do projeto para servlet puro + virtual threads. **Endereçar em M9 como primeira task técnica (pre-feature cleanup).**

- **`StructuredTaskScope` para paralelismo awaitable intra-request:** Avaliado pelo Comitê como alternativa ao `Thread.ofVirtual().start()` em `AiSyncClient` e rejeitado — `StructuredTaskScope` requer `scope.join()` antes de fechar o scope, bloqueando o thread pai. É incompatível com fire-and-forget por design (JEP 453/480). O caso de uso correto no projeto seria: montar DTOs compondo múltiplas fontes de dados em paralelo dentro do mesmo request — ex: `productRepo.findById()` + `reviewRepo.findByProductId()` em paralelo com `ShutdownOnFailure`. Endereçar quando houver call site com N resultados awaitable paralelos. Nota: `StructuredTaskScope` era Preview no Java 21; Feature somente no Java 23 — requer atenção ao `java.version` do `pom.xml`.

- **Graph-augmented RAG:** Use multi-hop Cypher traversal (e.g., "find products bought by clients who also bought X") as additional context for the RAG pipeline. Neo4j graph structure supports this without schema changes. Deferred to post-MVP.

- **Fine-tuning HuggingFace + Benchmarking comparativo (M4 ou pós-MVP):** Explorar fine-tuning de um modelo HuggingFace existente (ex: `sentence-transformers/all-MiniLM-L6-v2` ou `distilbert-base-uncased`) no domínio de produtos do catálogo, e comparar sistematicamente contra o modelo neural treinado com TensorFlow.js (M4). A ideia central é ter um endpoint de benchmarking (`POST /api/v1/benchmark`) que executa um mesmo conjunto de queries de recomendação nos dois modelos e retorna métricas comparativas (Precision@K, nDCG, latência p50/p95). O fine-tuning via HuggingFace `transformers` + `datasets` exige Python — isso abre uma decisão arquitetural: manter o fine-tuning em um script Python separado (offline, gera artefato `.bin`) e servir o resultado via `@xenova/transformers` no AI Service (ONNX export), ou adicionar um microserviço Python para servir o modelo fine-tuned. Deferred para exploração pós-M4, quando o modelo TensorFlow.js estiver treinado e os dados de comparação fizerem sentido. Ver D-001 (decisão TypeScript vs Python) — essa feature pode ser o ponto onde Python entra justificadamente no stack.

- **Kafka async recommendations:** Pre-compute recommendations asynchronously when a new order is placed. Demonstrates event-driven architecture. Deferred to post-MVP.

- **Precision@K / nDCG evaluation endpoint:** Expose recommendation quality metrics as a dedicated API endpoint. Important for production but deferred for MVP. _(Precision@K adicionada como M6-53/54 na fase de treino — este item refere-se ao endpoint dedicado de benchmarking contínuo)_

- **Open Food Facts enrichment:** Use Open Food Facts public API to enrich synthetic product descriptions with real nutritional data. Optional enrichment, deferred.

- **Live cloud deploy:** Deploy to Railway/Render/Fly.io for a public URL in the README. High portfolio impact, deferred until M6 is complete.

- **Model versioning com rollback (Comitê Achado #5):** Salvar modelos com timestamp (`/tmp/model/model-{timestamp}.json`) e manter o último "melhor" modelo como symlink. Permite rollback quando um novo treino produz qualidade inferior. Requer critério de comparação automático (ex: `precisionAt5` do novo modelo vs modelo atual). Severidade: Média. Pré-requisito: M6-53 (Precision@K implementado).

- **Job assíncrono para POST /model/train — padrão 202 + polling (Comitê Achado #6):** Treino síncrono bloqueia o cliente HTTP durante todo o processamento (~9s com 1040 amostras, minutos com 100K). Em produção, proxies (nginx, ALB) têm timeout de 60s. Solução: `POST /model/train` retorna `202 Accepted` com `jobId`, `GET /model/train/status/{jobId}` consulta o progresso. Compatível com a implementação atual do `ModelStore`. Severidade: Média. Pré-condição: dataset grande o suficiente para o timeout ser relevante.

- **p-limit concurrency no fetchAllPages de orders (Comitê Achado #7):** `Promise.all` sobre 1000 clientes dispara 1000 requests HTTP simultâneos para o `api-service`. Pode sobrecarregar o connection pool do Spring Boot ou causar `ECONNRESET`. Solução: `import pLimit from 'p-limit'; const limit = pLimit(10)` antes do `Promise.all`. Com os 20 clientes atuais, sem impacto prático. Severidade: Baixa. Endereçar quando o dataset crescer.

- **Weighted mean pooling por frequência de compra (Comitê Achado #3):** O perfil do cliente é calculado como média aritmética dos embeddings. Um produto comprado 50x tem o mesmo peso que um comprado 1x. Solução: ponderar cada embedding pelo `quantity` do pedido — `clientProfile = Σ(embedding_i × quantity_i) / Σ(quantity_i)`. Requer buscar `quantity` das edges `:BOUGHT` no Neo4j. Severidade: Baixa. Melhoria de qualidade do modelo pós-MVP.

- **Autenticação no endpoint POST /model/train (Comitê Achado #10):** Qualquer cliente que conhece a URL pode retreinar o modelo ou causar carga excessiva. Solução: header `X-Admin-Key` validado contra env var `ADMIN_API_KEY`, ou JWT com role `admin`. Na rede interna Docker do MVP, risco irrelevante. Severidade: Baixa. Endereçar antes de qualquer exposição pública.

- **Online learning via `model.trainOnBatch()` para compras individuais (M9 — Sessão 002, Caminho G — Rejeitado):** Avaliado pelo Comitê Ampliado como alternativa para "aprendizado em tempo real" sem retreinamento completo. Rejeitado por dois riscos: (1) *catastrophic forgetting* — `trainOnBatch()` com uma única amostra sobrescreve o aprendizado generalizado da rede, degradando recomendações para outros clientes; (2) *thread safety* — TensorFlow.js usa um backend global; chamadas concorrentes de Fastify sem lock podem corromper o estado interno dos tensores. O padrão seguro para produção seria uma fila de treinamento serial (um job por vez), que converge para o padrão 202 + async já deferido (Comitê Achado #6). Deferred indefinidamente — risco supera o benefício para o escopo de demonstração.

- **Animação de reordenação com física (M8 — Sessão 001, Sugestão UI Designer):** O UI Designer Léa Santana sugeriu Framer Motion `layout` prop para a animação de reordenação dos cards após "Ordenar por IA". O sprint do M8 pode usar CSS transitions simples (`transform: translate`, `transition: transform 500ms ease`) para entregar o efeito visual sem nova dependência; Framer Motion pode ser adicionado se a animação CSS revelar limitações em cards que mudam de coluna no grid. Deferred para pós-M8.

- **Query params `?client=&ai=on` para deep link e testes (M8/M9 — Sessão 001, Sugestão Arquiteto Rafael):** Serializar o estado da UI na URL permite compartilhar links e simplifica asserções nos testes Playwright (`await page.goto('/catalog?client=1&ai=on')`). Verificar qual roteador o projeto usa (App Router vs Pages Router) antes de implementar `useSearchParams` ou `router.push({ shallow: true })`. Deferred para o design.md do M8.

- **Aba "Análise" — layout interno a ser definido no design.md do M9-B (Tensão T3 — Sessão 002):** O documento de UX (Sessão 001) propõe a aba "Análise" para comparar "Sem IA vs Com IA". O Feature Committee (Sessão 002) reusa a mesma aba para o botão "Deep Retrain + progresso ao vivo". Resolução aprovada: a aba contém ambos os painéis (comparação à esquerda, controles de retrain à direita em tela grande; tabs empilhadas em mobile). Layout exato a ser definido no `design.md` do M9-B, referenciando os dois documentos de comitê como contexto.

- **Cron diário de retreinamento automático (GAP-01):** O modelo neural fica desatualizado silenciosamente após novos pedidos serem criados. O `staleDays` e `staleWarning` foram implementados no M6 como observabilidade passiva — o sistema avisa que está velho, mas nenhum mecanismo reage automaticamente. Retreinar a cada compra é incorreto (custo computacional, catastrophic forgetting, race conditions); o padrão correto para sistemas B2B é retreinamento em batch diário. Solução: cron interno no `ai-service` (ex: `node-cron`) disparando `modelTrainer.train()` em background todo dia às 02h. Pré-condição: implementar o padrão 202 + async (Comitê Achado #6) para que o cron não bloqueie o event loop. Os dois itens se encaixam: o cron precisa do treino assíncrono; o treino assíncrono precisa de um disparador que não seja manual. Severidade: Média-Alta para produção. Pré-requisito: Comitê Achado #6 (202 + polling).

- **Sincronização automática de produtos novos com Neo4j + embeddings (GAP-02):** Produto cadastrado via `POST /products` no `api-service` é salvo apenas no PostgreSQL. O Neo4j não recebe o nó novo e nenhum embedding é gerado, tornando o produto invisível para busca semântica, RAG e recomendações até que o operador chame manualmente `POST /embeddings/generate`. Diferente do GAP de `:BOUGHT` (resolvido no M6-45), este gap não foi documentado em nenhum ADR, spec ou task. Solução A (simples): `api-service` chama `POST /aiservice/api/v1/embeddings/generate` após salvar produto — síncrono mas frágil se o ai-service estiver fora. Solução B (robusta): cron no ai-service que roda `generateEmbeddings()` periodicamente (só processa produtos com `embedding IS NULL` — já idempotente). Solução C (event-driven): evento `product.created` via Kafka — convergente com D-03. Severidade: Alta para funcionalidade de IA. Pré-requisito: nenhum.

### Ops — Neo4j: arestas `BOUGHT {is_demo: true}` legadas (2026-04-30)

**Contexto:** O `ai-service` deixou de expor `POST/DELETE /api/v1/demo-buy` e os mutadores Neo4j associados. Leituras de perfil, datas de compra confirmada e treino **continuam** a filtrar `coalesce(r.is_demo, false) = false`, por isso dados demo antigos não entram no ranking nem no tensor — mas podem permanecer no grafo.

**Limpeza opcional (após backup):** executar o script Cypher em `scripts/neo4j-delete-demo-bought-edges.cypher` na raiz do repositório `smart-marketplace-recommender` (revisar o `MATCH` de contagem comentado no ficheiro antes do `DELETE`).

---

## Preferences

- Language for specs and documentation: Portuguese (README bilingual pt-BR / en)
- Commit message style: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Branch strategy: `main` (stable) + `feat/milestone-name` per milestone

---

## Repository

- **GitHub:** `git@github-gabrielgrillorosa:gabrielgrillorosa/smart-marketplace-recommender.git`
- **URL:** `https://github.com/gabrielgrillorosa/smart-marketplace-recommender`
- **SSH host alias:** `github-gabrielgrillorosa` (via `~/.ssh/config`, chave `id_ed25519`)
- **Visibility:** Public (portfolio)

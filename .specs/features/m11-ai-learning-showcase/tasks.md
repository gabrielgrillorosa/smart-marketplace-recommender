# M11 — AI Learning Showcase — Tasks

**Design**: `.specs/features/m11-ai-learning-showcase/design.md`
**Status**: Complete ✅ — 8/8 tasks done, ESLint ✓, npm run build ✓, 72 AI Vitest tests

---

## Execution Plan

### Phase 1: Backend ML Refactor (Sequential)

`buildTrainingDataset` deve existir antes de modificar o `ModelTrainer`. As duas tasks são sequenciais pois T2 depende da função pura de T1.

```
T1 ──→ T2
```

### Phase 2: Frontend State Foundation (Paralela)

`analysisSlice` e `RecommendationColumn` não dependem entre si — podem rodar em paralelo. Ambos são pré-requisitos para o `AnalysisPanel`.

```
       ┌→ T3 [P] ─┐
T2 ────┤           ├──→ T5
       └→ T4 [P] ─┘
```

> **Nota:** T3 e T4 dependem apenas de T2 ter sido mergeado para que o ambiente compile corretamente (sem erros de tipo no `ModelTrainer`). Não há dependência de código entre eles.

### Phase 3: AnalysisPanel Orchestration + RetrainPanel Tweak (Sequential)

`AnalysisPanel` consome `analysisSlice` (T3), `RecommendationColumn` (T4) e faz o wiring de snapshots. `RetrainPanel` é uma modificação menor acoplada à existência do `analysisSlice`.

```
T3, T4 ──→ T5 ──→ T6
```

### Phase 4: Store Wiring + E2E (Sequential)

`useAppStore` adiciona o `analysisSlice` e encadeia o reset. E2E valida o fluxo completo.

```
T6 ──→ T7 ──→ T8
```

---

## Task Breakdown

### T1: Criar `ai-service/src/services/training-utils.ts` com `buildTrainingDataset`

**What**: Extrair a lógica de construção do dataset de treino do `ModelTrainer` para uma função pura testável, adicionando negative sampling balanceado (N=4), hard negative mining por categoria e seed determinístico (ADR-027).
**Where**: `ai-service/src/services/training-utils.ts` (novo)
**Depends on**: None
**Reuses**: Lógica de `meanPooling` e loop de `clients/products` já em `ModelTrainer.ts`; padrão de função pura sem efeitos colaterais; seed LCG portado de `lib/utils/shuffle.ts` do frontend
**Requirement**: M11-01, M11-02, M11-03, M11-04, M11-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Interface `TrainingDatasetOptions` exportada com `negativeSamplingRatio: number`, `seed?: number`, `useClassWeight?: boolean`
- [ ] Função `buildTrainingDataset(clients, clientOrderMap, productEmbeddingMap, products, options): { inputVectors: number[][], labels: number[] }` exportada
- [ ] Negative sampling: para cada cliente com histórico, para cada produto positivo, seleciona exatamente `negativeSamplingRatio` (padrão 4) negativos
- [ ] Hard negative mining: para cada positivo da categoria X, pelo menos 2 dos `negativeSamplingRatio` negativos são de categoria diferente de X (`product.category !== positiveCategory`)
- [ ] Seed determinístico: LCG puro (`seed = (seed * 1664525 + 1013904223) & 0xffffffff`) — garante mesmos negativos para os mesmos dados de entrada
- [ ] Fallback `useClassWeight === false`: upsampling manual — cada amostra positiva é duplicada `negativeSamplingRatio` vezes no array de saída
- [ ] Caso edge: `buildTrainingDataset` com `clients` vazio retorna `{ inputVectors: [], labels: [] }` sem lançar erro
- [ ] Caso edge: produto sem embedding (`productEmbeddingMap` não tem o `product.id`) é silenciosamente ignorado
- [ ] Testes unitários Vitest cobrindo: (a) contagem de amostras por cliente com N=4; (b) hard negative mining — ao menos 2 negativos de categoria diferente por positivo; (c) seed determinístico — dois calls com mesma seed retornam resultado idêntico; (d) fallback upsampling when `useClassWeight: false`
- [ ] `tsc --noEmit` no ai-service sem erros
- [ ] Gate check passa: `npm run lint && npm run test` — ESLint ✓, Vitest ✓ (todos os testes existentes + novos)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ai-service): extract buildTrainingDataset with hard negative mining and seeded sampling (ADR-027)`

---

### T2: Modificar `ModelTrainer.ts` — nova arquitetura + buildTrainingDataset + classWeight

**What**: Substituir a construção inline do dataset em `ModelTrainer.train()` por `buildTrainingDataset()` (T1); atualizar `buildModel()` para `Dense[64, relu, l2(1e-4)]→Dropout[0.2]→Dense[1, sigmoid]`; adicionar `classWeight: {0:1.0, 1:4.0}` no `model.fit()`; atualizar `EPOCHS=30, BATCH_SIZE=16`; adicionar early stopping com patience=5 (ADR-028).
**Where**: `ai-service/src/services/ModelTrainer.ts` (modificar)
**Depends on**: T1 (`buildTrainingDataset` deve existir para importar)
**Reuses**: Estrutura existente de `syncNeo4j`, `demoPairs`, `clientOrderMap`, `computePrecisionAtK`; `tf.layers.dense` com `kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 })` — API TF.js existente
**Requirement**: M11-01, M11-02, M11-03, M11-06, M11-07

**Tools**:
- MCP: user-context7 (verificar API `model.fit classWeight` no TF.js caso haja dúvida de sintaxe)
- Skill: NONE

**Done when**:
- [ ] `buildModel()` retorna `Sequential` com `Dense(64, relu, l2(1e-4)) → Dropout(0.2) → Dense(1, sigmoid)` — arquitetura anterior removida
- [ ] `EPOCHS = 30` e `BATCH_SIZE = 16` (constantes locais do arquivo)
- [ ] `model.fit()` recebe `classWeight: { 0: 1.0, 1: 4.0 }` — testado via runtime; se a versão do TF.js não suportar, o build falha com erro claro (detectável no gate check)
- [ ] Loop de construção de `inputVectors`/`labels` inline substituído por `buildTrainingDataset(clients, clientOrderMap, productEmbeddingMap, products, { negativeSamplingRatio: 4, seed: seedFromClientIds(clients), useClassWeight: true })`
- [ ] Seed derivado de `clientId` hash: função local pura `seedFromClientIds(clients: ClientDTO[]): number` — soma os char codes dos primeiros 8 chars de cada clientId; estável para o mesmo conjunto de clientes
- [ ] Early stopping: callback `onEpochEnd` adiciona contagem de `patienceCounter`; se `loss` não reduzir mais de `1e-4` por `patience=5` epochs consecutivos, chama `model.stopTraining = true`
- [ ] `inputVectors` dimensão: `productEmb(384) + clientProfileVector(384) = 768` — `inputShape: [768]` em `buildModel()` preservado (adicionado assert `if (inputVectors[0]?.length !== 768) throw new Error(...)` antes de criar tensor)
- [ ] `tsc --noEmit` no ai-service sem erros
- [ ] Gate check passa: `npm run lint && npm run test` — ESLint ✓, Vitest ✓ (todos os 63+ testes existentes passam; nenhum teste deletado)

**Tests**: unit (modificação em código que já tem testes no `model.test.ts`)
**Gate**: quick

**Commit**: `feat(ai-service): update ModelTrainer with reduced architecture, classWeight, early stopping (ADR-028)`

---

### T3: Criar `analysisSlice.ts` no Zustand store [P]

**What**: Criar o slice Zustand volátil `analysisSlice` com type discriminada de 4 fases (`empty | initial | demo | retrained`), snapshots tipados por `clientId`, e as 4 actions (`captureInitial`, `captureDemo`, `captureRetrained`, `resetAnalysis`) (ADR-029).
**Where**: `frontend/store/analysisSlice.ts` (novo)
**Depends on**: T2 (nenhuma dependência de código, mas ambiente deve compilar clean)
**Reuses**: Padrão de `clientSlice.ts` e `demoSlice.ts` para assinatura de `StateCreator`; tipo `RecommendationResult` de `lib/types.ts`
**Requirement**: M11-08, M11-09, M11-10, M11-11, M11-12, M11-13

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Tipos exportados: `Snapshot = { recommendations: RecommendationResult[]; capturedAt: string }` e `AnalysisState` com 4 discriminantes (`empty | initial | demo | retrained`) — cada fase contém `clientId` e os snapshots acumulados do passado
- [ ] Interface `AnalysisSlice` exportada com `analysis: AnalysisState` + 4 actions
- [ ] `captureInitial(clientId, recs)`: transição `empty → initial`; ignorado silenciosamente se `recs.length === 0`; `capturedAt` = `new Date().toISOString()`
- [ ] `captureDemo(clientId, recs)`: transição `initial → demo`; ignorado se `analysis.phase !== 'initial'` ou `analysis.clientId !== clientId`
- [ ] `captureRetrained(clientId, recs)`: transição `demo → retrained`; ignorado se `analysis.phase !== 'demo'` ou `analysis.clientId !== clientId`
- [ ] `resetAnalysis()`: retorna para `{ phase: 'empty' }` — chamado ao trocar de cliente
- [ ] Slice é **volátil** — sem `persist` (não é adicionado ao `partialize` do `clientSlice`)
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (Zustand slices não têm cobertura unitária per projeto — validados via E2E)
**Gate**: quick

**Commit**: `feat(frontend): create analysisSlice with 4-phase discriminated union (ADR-029)`

---

### T4: Criar `RecommendationColumn` presentacional [P]

**What**: Criar o componente presentacional puro `RecommendationColumn` com estados `empty`, `loading` (5 skeletons), `populated` (lista com score badges), `colorScheme` semântico e `capturedAt` timestamp (ADR-030).
**Where**: `frontend/components/analysis/RecommendationColumn.tsx` (novo — criar diretório `analysis/`)
**Depends on**: T2 (nenhuma dependência de código, mas ambiente deve compilar clean)
**Reuses**: `ScoreBadge` de `components/ui/ScoreBadge.tsx`; `Skeleton` de `components/ui/skeleton.tsx`; `cn()` de `lib/utils.ts`; tipo `RecommendationResult` de `lib/types.ts`
**Requirement**: M11-14, M11-15, M11-16, M11-17, M11-18, M11-19, M11-20

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Props: `{ title: string; badge?: React.ReactNode; recommendations: RecommendationResult[] | null; loading?: boolean; emptyMessage?: string; colorScheme: 'gray' | 'blue' | 'emerald' | 'violet'; capturedAt?: string }`
- [ ] Estado `empty` (`recommendations === null && !loading`): container com `role="list"`, `aria-label="Recomendações [título]"`, fundo `bg-gray-50`, borda dashed, ícone central + `emptyMessage` (fallback "Aguardando dados...")
- [ ] Estado `loading` (`loading === true`): 5 `<Skeleton>` cards com `animate-pulse`, altura `h-12` cada
- [ ] Estado `populated` (`recommendations.length > 0`): lista de cards com nome do produto, `<ScoreBadge>` com score, posição numérica (1–N)
- [ ] `colorScheme` mapeia para classes de header: `gray → bg-gray-100 text-gray-700`, `blue → bg-blue-50 text-blue-700`, `emerald → bg-emerald-50 text-emerald-700`, `violet → bg-violet-50 text-violet-700`
- [ ] `capturedAt` exibido como `<time dateTime={capturedAt}>HH:MM</time>` no header quando presente (Staff UI Designer, Low)
- [ ] Animações: snapshot `retrained` aparece com `motion-safe:transition-opacity duration-300 ease-out opacity-0 → opacity-100` via `useEffect` mount; score badge update `motion-safe:transition-transform scale-105 → scale-100` via CSS class
- [ ] Cards com `min-h-[44px]` para touch target mobile
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (componente React sem cobertura unitária per projeto)
**Gate**: quick

**Commit**: `feat(frontend): create RecommendationColumn presentational component (ADR-030)`

---

### T5: Modificar `AnalysisPanel` — snapshot orchestration + layout responsivo + accordion

**What**: Adicionar orquestração de snapshots no `AnalysisPanel` (captura `initial`, `demo`, `retrained`) e refatorar o layout para `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` com as 4 `RecommendationColumn` instâncias; accordion para colunas 3 e 4 em viewport `< xl`.
**Where**: `frontend/components/recommendations/AnalysisPanel.tsx` (modificar)
**Depends on**: T3 (`analysisSlice` — necessário para `captureInitial`, `captureDemo`, `captureRetrained`, leitura de `analysis.phase`), T4 (`RecommendationColumn`)
**Reuses**: `useRecommendations()` domain hook existente para snapshot `initial`; `useAppStore` para ler `demoSlice.demoBoughtByClient` e disparar snapshot `demo`; `useRetrainJob` pattern para detectar `done` e disparar snapshot `retrained` — **sem** modificar `RetrainPanel` diretamente; `ShuffledColumn` e `RecommendedColumn` existentes **não são alterados**
**Requirement**: M11-14, M11-15, M11-16, M11-17, M11-18, M11-19, M11-20, M11-21, M11-22, M11-23, M11-24, M11-25

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `captureInitial`: `useEffect([selectedClient, recommendationSlice.recommendations])` — captura quando `recommendations.length > 0` e `analysis.phase === 'empty'` e `selectedClient?.id === recommendations[0].clientId` (ou equivalente para o clientId corrente)
- [ ] `captureDemo`: `useEffect([demoSlice.demoBoughtByClient])` — quando `Object.keys(demoBought).length > 0` para o `selectedClient.id`, chama `GET /api/proxy/recommend?clientId=...` e captura resultado; dispara apenas se `analysis.phase === 'initial'`
- [ ] `captureRetrained`: `AnalysisPanel` recebe ou lê `retrainStatus` do `useRetrainJob` — ao detectar transição para `done`, chama `GET /api/proxy/recommend?clientId=...` e captura; dispara apenas se `analysis.phase === 'demo'`
- [ ] Layout desktop `xl:grid-cols-4`: coluna 1 "Sem IA" (gray), coluna 2 "Com IA" (blue), coluna 3 "Com Demo" (emerald), coluna 4 "Pós-Retreino" (violet)
- [ ] Layout tablet `md:grid-cols-2`: colunas 1+2 visíveis; colunas 3 e 4 em accordion colapsado com botão "▼ Ver Com Demo" na bottom da coluna 2
- [ ] Accordion: `aria-expanded` no botão; `max-height + opacity transition 250ms ease-out`; `motion-safe:transition-*`; `Escape` fecha; foco retorna ao botão após fechar
- [ ] `ShuffledColumn` e `RecommendedColumn` existentes **preservados** na parte superior do painel (não substituídos por `RecommendationColumn`) — `RecommendationColumn` é adicional para as colunas 1..4 da nova grade
- [ ] `ClientProfileCard` existente **preservado** — sem modificação
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (componente React sem cobertura unitária per projeto)
**Gate**: quick

**Commit**: `feat(frontend): add snapshot orchestration and 4-column responsive layout to AnalysisPanel`

---

### T6: Modificar `RetrainPanel` — botão desabilitado quando `phase === 'empty'`

**What**: Adicionar disable logic no botão "🔄 Retreinar Modelo" do `RetrainPanel` quando `analysisSlice.analysis.phase === 'empty'`, usando `useAppStore` para ler o phase (design spec: sem tooltip extra).
**Where**: `frontend/components/retrain/RetrainPanel.tsx` (modificar)
**Depends on**: T5 (`AnalysisPanel` já consome `analysisSlice`; T6 garante que `analysisSlice` está no store antes de RetrainPanel o ler — dependência via T3/T5)
**Reuses**: Condição `disabled` existente no botão: `disabled={status !== 'idle' && ...}` — adicionar `|| analysis.phase === 'empty'`; `useAppStore` já importado ou acessível
**Requirement**: M11-26

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `const { analysis } = useAppStore((s) => s.analysis)` (ou `useAppStore((s) => ({ analysis: s.analysis }))`) adicionado ao `RetrainPanel`
- [ ] Condição `disabled` do botão inclui `|| analysis.phase === 'empty'`
- [ ] Botão com `aria-disabled="true"` quando desabilitado por `phase === 'empty'` (já presente para outros estados — verificar que não quebra)
- [ ] Sem tooltip adicional — design spec explícito: "UI já comunica pelo contexto"
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none
**Gate**: quick

**Commit**: `feat(frontend): disable RetrainPanel button when analysis phase is empty`

---

### T7: Adicionar `analysisSlice` ao `useAppStore` + reset chain ao trocar cliente

**What**: Compor `analysisSlice` no `useAppStore` e encadear `resetAnalysis()` quando `clientSlice` muda de cliente, seguindo o padrão de `subscribe` estabelecido em AD-019 para `demoSlice`.
**Where**: `frontend/store/index.ts` (ou `useAppStore.ts` — arquivo de composição do store) (modificar)
**Depends on**: T6 (garante que `RetrainPanel` já lê `analysisSlice` — merge sem conflito)
**Reuses**: Padrão de `subscribe` em `useAppStore` para `demoSlice` reset ao trocar cliente (AD-019); `StateCreator` pattern dos outros slices
**Requirement**: M11-08, M11-12, M11-27

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `analysisSlice` composto no `create(...)` junto com `clientSlice`, `recommendationSlice`, `demoSlice`
- [ ] `useAppStore.subscribe` encadeia `resetAnalysis()` quando `selectedClient?.id` muda (mesmo padrão do `demoSlice`)
- [ ] `analysisSlice` **não** está no `partialize` de `persist` (slice volátil)
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none
**Gate**: quick

**Commit**: `feat(frontend): compose analysisSlice into useAppStore with client-change reset chain`

---

### T8: E2E Playwright — `m11-ai-learning-showcase.spec.ts`

**What**: Criar spec Playwright cobrindo o fluxo completo do M11: seleção de cliente → coluna "Com IA" capturada automaticamente → compras demo → coluna "Com Demo" capturada → retreinamento → coluna "Pós-Retreino" capturada → comparação das 4 colunas visível; layout responsivo; reset ao trocar cliente.
**Where**: `frontend/e2e/tests/m11-ai-learning-showcase.spec.ts` (novo)
**Depends on**: T7 (integração completa disponível)
**Reuses**: Padrão de `m9b-deep-retrain.spec.ts` e `m9a-demo-buy.spec.ts`: `page.goto('/')` + `waitForLoadState('networkidle')`, locators por texto visível, `waitFor({ state: 'attached' })`
**Requirement**: M11-01 a M11-27 (validação E2E end-to-end dos fluxos críticos)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Teste 1 — fase `initial`: seleciona cliente → navega para "Análise" → verifica coluna "Com IA" populated (score badges visíveis) → coluna "Com Demo" em estado empty com instrução
- [ ] Teste 2 — fase `demo`: executa "Demo Comprar" em produto do catálogo → retorna à aba "Análise" → verifica coluna "Com Demo" populated com recomendações diferentes da coluna "Com IA"
- [ ] Teste 3 — fase `retrained`: clica "🔄 Retreinar Modelo" → aguarda conclusão → verifica coluna "Pós-Retreino" populated → verifica 4 colunas visíveis em xl viewport
- [ ] Teste 4 — botão disabled: verifica que antes de selecionar cliente ou ao resetar (trocar cliente) o botão "Retreinar" está com `aria-disabled="true"` ou `disabled`
- [ ] Teste 5 — reset ao trocar cliente: seleciona cliente A, avança para fase `demo`, seleciona cliente B → verifica que colunas 3 e 4 voltam ao estado empty
- [ ] Teste 6 — accordion tablet: viewport 768px → navega para "Análise" → verifica que botão "▼ Ver Com Demo" presente → click expande coluna 3
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Build gate passa: `npm run lint && npm run build && npm run test:e2e` — ESLint ✓, build ✓, E2E spec ✓

**Tests**: e2e
**Gate**: build

**Commit**: `feat(frontend): add Playwright E2E spec for M11 AI Learning Showcase`

---

## Parallel Execution Map

```
Phase 1 (Sequential — Backend ML):
  T1 ──→ T2

Phase 2 (Parallel — Frontend State Foundation):
  T2 complete, then:
    ├── T3 [P]  ─┐
    └── T4 [P]  ─┤──→ T5

Phase 3 (Sequential — AnalysisPanel + RetrainPanel):
  T3, T4 ──→ T5 ──→ T6

Phase 4 (Sequential — Store Wiring + E2E):
  T6 ──→ T7 ──→ T8
```

---

## Task Granularity Check

| Task | Scope | Status |
|------|-------|--------|
| T1: `training-utils.ts` | 1 arquivo novo, função pura + testes unitários | ✅ Granular |
| T2: `ModelTrainer.ts` | 1 arquivo modificado, 4 mudanças coesas (import, buildModel, fit params, early stopping) | ✅ OK (coesas, 1 arquivo) |
| T3: `analysisSlice.ts` | 1 arquivo novo, 1 slice com 4 actions | ✅ Granular |
| T4: `RecommendationColumn.tsx` | 1 componente novo | ✅ Granular |
| T5: `AnalysisPanel.tsx` | 1 arquivo modificado — snapshot orchestration + layout responsivo (acoplados: não faz sentido um sem o outro) | ✅ OK (coesos, 1 arquivo) |
| T6: `RetrainPanel.tsx` | 1 arquivo modificado, 1 condição adicionada | ✅ Granular |
| T7: `useAppStore` composição | 1 arquivo modificado, composição + subscribe chain | ✅ Granular |
| T8: E2E spec | 1 arquivo de spec | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|------|------------------------|---------------|--------|
| T1 | None | Início de Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 (ambiente) | T2 → T3 [P] | ✅ Match |
| T4 | T2 (ambiente) | T2 → T4 [P] | ✅ Match |
| T5 | T3, T4 | T3, T4 → T5 | ✅ Match |
| T6 | T5 (via T3 no store) | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Requires | Task Says | Status |
|------|-----------------------------|----------|-----------|--------|
| T1: `training-utils.ts` | Função pura de lógica ML | **unit** (nova lógica de negócio pura testável em isolamento) | unit | ✅ OK |
| T2: `ModelTrainer.ts` | Serviço com lógica ML modificada | **unit** (testes existentes em `model.test.ts` devem continuar passando) | unit | ✅ OK |
| T3: `analysisSlice.ts` | Zustand slice frontend | **none** (slices validados via E2E per projeto) | none | ✅ OK |
| T4: `RecommendationColumn.tsx` | Componente React | **none** (componentes React sem cobertura unitária per projeto) | none | ✅ OK |
| T5: `AnalysisPanel.tsx` | Componente React | **none** (componentes React sem cobertura unitária per projeto) | none | ✅ OK |
| T6: `RetrainPanel.tsx` | Componente React | **none** | none | ✅ OK |
| T7: `useAppStore` composição | Store Zustand | **none** (store validado via E2E) | none | ✅ OK |
| T8: E2E spec | Fluxo E2E completo | Playwright | e2e | ✅ OK |

---

## Requirement Traceability

| Requirement | Covered by |
|-------------|------------|
| M11-01 (negative sampling N=4) | T1, T2 |
| M11-02 (hard negative mining por categoria) | T1, T2 |
| M11-03 (seed determinístico derivado de clientId) | T1, T2 |
| M11-04 (classWeight fallback upsampling) | T1 |
| M11-05 (testes unitários buildTrainingDataset) | T1 |
| M11-06 (arquitetura Dense[64]→Dropout→Dense[1]) | T2 |
| M11-07 (EPOCHS=30, BATCH_SIZE=16, early stopping) | T2 |
| M11-08 (analysisSlice type discriminada 4 fases) | T3, T7 |
| M11-09 (captureInitial guarda com clientId) | T3 |
| M11-10 (captureDemo transição initial→demo) | T3 |
| M11-11 (captureRetrained transição demo→retrained) | T3 |
| M11-12 (resetAnalysis ao trocar cliente) | T3, T7 |
| M11-13 (captureInitial ignorado se recs vazio) | T3 |
| M11-14 (RecommendationColumn presentacional) | T4 |
| M11-15 (estado empty com emptyMessage) | T4 |
| M11-16 (estado loading 5 skeletons) | T4 |
| M11-17 (estado populated com score badges) | T4 |
| M11-18 (colorScheme semântico 4 valores) | T4 |
| M11-19 (capturedAt timestamp na coluna) | T4 |
| M11-20 (aria-label e role="list") | T4 |
| M11-21 (AnalysisPanel captura snapshot initial) | T5 |
| M11-22 (AnalysisPanel captura snapshot demo) | T5 |
| M11-23 (AnalysisPanel captura snapshot retrained) | T5 |
| M11-24 (layout xl:grid-cols-4) | T5 |
| M11-25 (accordion colunas 3/4 em md) | T5 |
| M11-26 (RetrainPanel disabled quando phase=empty) | T6 |
| M11-27 (useAppStore compõe analysisSlice) | T7, T8 |

**Coverage:** 27/27 requirements mapped ✅

---

## Pre-Execution: MCPs e Skills

Antes de iniciar a execução, confirmar quais ferramentas usar em cada task:

**MCPs disponíveis**: `user-context7`, `user-filesystem`, `user-github`
**Skills disponíveis**: `coding-guidelines`, `best-practices`, `react-best-practices`

| Task | MCP sugerido | Skill sugerida |
|------|-------------|----------------|
| T1 (training-utils) | NONE | coding-guidelines (função pura) |
| T2 (ModelTrainer) | user-context7 (verificar `classWeight` API no TF.js se necessário) | coding-guidelines |
| T3 (analysisSlice) | NONE | NONE |
| T4 (RecommendationColumn) | NONE | react-best-practices |
| T5 (AnalysisPanel) | NONE | react-best-practices |
| T6 (RetrainPanel) | NONE | NONE |
| T7 (useAppStore) | NONE | NONE |
| T8 (E2E) | NONE | NONE |

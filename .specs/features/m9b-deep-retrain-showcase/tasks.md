# M9-B — Deep Retrain Showcase — Tasks

**Design**: `.specs/features/m9b-deep-retrain-showcase/design.md`
**Spec**: `.specs/features/m9b-deep-retrain-showcase/spec.md`
**Status**: Draft

---

## Execution Plan

### Phase 1: Foundation — Types + HTTP Adapters + Proxy Routes (Sequential then Parallel)

Tipos compartilhados devem existir antes de qualquer implementação. Proxy routes e adapters não dependem entre si após T1 — podem rodar em paralelo.

```
T1 ──→ T2 [P]
       T3 [P]
```

### Phase 2: Core Hook (Sequential)

`useRetrainJob` depende dos adapters (T2) para compilar e dos tipos (T1).

```
T2 ──→ T4
```

### Phase 3: Componentes React (Paralelo)

`TrainingProgressBar` e `ModelMetricsComparison` são folhas — sem dependência entre si. Ambos dependem dos tipos (T1) e do hook (T4) apenas por contrato de props.

```
       ┌→ T5 [P] ─┐
T4 ────┤           ├──→ T7
       └→ T6 [P] ─┘
```

### Phase 4: Integração — RetrainPanel + AnalysisPanel + page.tsx + E2E (Sequential)

`RetrainPanel` agrega T5 e T6. `AnalysisPanel` consome `RetrainPanel`. `page.tsx` conecta always-mounted. E2E fecha o ciclo.

```
T5, T6 ──→ T7 ──→ T8 ──→ T9
```

---

## Task Breakdown

### T1: Adicionar tipos M9-B a `lib/types.ts`

**What**: Adicionar `JobStatus`, `ModelMetrics`, `TrainJobResponse`, `TrainStatusResponse`, `ModelStatusResponse` ao arquivo de tipos compartilhado do frontend.
**Where**: `frontend/lib/types.ts` (modificar — adicionar ao final)
**Depends on**: None
**Reuses**: Padrão de tipos existentes no mesmo arquivo (`Recommendation`, `Client`, etc.)
**Requirement**: M9B-01, M9B-04, M9B-05, M9B-06, M9B-07, M9B-08, M9B-09, M9B-10, M9B-31

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `export type JobStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'network-error'` adicionado
- [ ] `export interface ModelMetrics { precisionAt5: number; loss: number; epoch: number; trainedAt: string }` adicionado
- [ ] `export interface TrainJobResponse { jobId: string; status: 'queued' }` adicionado
- [ ] `export interface TrainStatusResponse { status: 'queued' | 'running' | 'done' | 'failed'; epoch: number; totalEpochs: number; loss: number | null; eta: number | null }` adicionado
- [ ] `export interface ModelStatusResponse { currentJobId: string | null; currentModel: ModelMetrics | null; versionHistory: ModelMetrics[] }` adicionado
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (tipos não requerem teste per TESTING.md)
**Gate**: quick

**Commit**: `feat(frontend): add M9-B type definitions to lib/types.ts`

---

### T2: Criar `lib/adapters/train.ts` com funções HTTP [P]

**What**: Criar o adapter `train.ts` com as três funções puras `postModelTrain(adminKey)`, `getModelStatus()`, `pollTrainStatus(jobId)` que chamam as proxy routes correspondentes.
**Where**: `frontend/lib/adapters/train.ts` (novo)
**Depends on**: T1 (tipos `TrainJobResponse`, `TrainStatusResponse`, `ModelStatusResponse` necessários)
**Reuses**: Padrão de `lib/adapters/recommend.ts` e `lib/adapters/rag.ts`; `apiFetch` de `lib/fetch-wrapper.ts`
**Requirement**: M9B-02, M9B-08, M9B-18, M9B-19, M9B-20, M9B-28, M9B-30

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `postModelTrain(adminKey: string): Promise<TrainJobResponse>` — `POST /api/proxy/model/train` com header `X-Admin-Key: adminKey` — lança erros tipados para 401 e 409 (`{ jobId? }` no body do 409)
- [ ] `getModelStatus(): Promise<ModelStatusResponse>` — `GET /api/proxy/model/status`
- [ ] `pollTrainStatus(jobId: string): Promise<TrainStatusResponse>` — `GET /api/proxy/model/train/status/${jobId}`
- [ ] Leitura de `NEXT_PUBLIC_ADMIN_API_KEY` feita aqui (não em componentes)
- [ ] Função `postModelTrain` não lê a env var — recebe `adminKey` como parâmetro (testabilidade)
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (adapters não têm cobertura per TESTING.md — validados via E2E)
**Gate**: quick

**Commit**: `feat(frontend): create lib/adapters/train.ts with postModelTrain, getModelStatus, pollTrainStatus`

---

### T3: Criar 3 proxy routes Next.js para endpoints de model [P]

**What**: Criar os três route handlers Next.js que fazem proxy para o AI Service: `POST /api/proxy/model/train`, `GET /api/proxy/model/status`, `GET /api/proxy/model/train/status/[jobId]`.
**Where**:
- `frontend/app/api/proxy/model/train/route.ts` (novo — POST)
- `frontend/app/api/proxy/model/status/route.ts` (novo — GET)
- `frontend/app/api/proxy/model/train/status/[jobId]/route.ts` (novo — GET)
**Depends on**: T1 (tipos para tipagem das responses)
**Reuses**: Padrão de `app/api/proxy/recommend/route.ts` — estrutura idêntica de `NextResponse.json(data, { status })` + forwarding de headers
**Requirement**: M9B-02, M9B-04, M9B-08, M9B-28, M9B-30

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `POST /api/proxy/model/train` → `POST ${AI_SERVICE_URL}/api/v1/model/train` com header `X-Admin-Key` forwarded da request do browser — retorna status original (200, 202, 401, 409)
- [ ] `GET /api/proxy/model/status` → `GET ${AI_SERVICE_URL}/api/v1/model/status` — retorna JSON do ai-service
- [ ] `GET /api/proxy/model/train/status/[jobId]` → `GET ${AI_SERVICE_URL}/api/v1/model/train/status/${jobId}` — retorna JSON do ai-service
- [ ] `AI_SERVICE_URL` lido de `process.env.AI_SERVICE_URL` (server-side) — padrão já usado nas outras proxy routes
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (proxy routes não têm cobertura unitária per TESTING.md — validados via E2E)
**Gate**: quick

**Commit**: `feat(frontend): add proxy routes for model/train, model/status, model/train/status/[jobId]`

---

### T4: Criar hook `useRetrainJob`

**What**: Criar o hook `useRetrainJob` que encapsula disparo + polling com backoff + circuit-breaker de 3 erros + acúmulo de métricas antes/depois. Implementa o padrão `jobIdRef` (ADR-025) para evitar stale closure no `setInterval`.
**Where**: `frontend/lib/hooks/useRetrainJob.ts` (novo)
**Depends on**: T2 (adapters `postModelTrain`, `getModelStatus`, `pollTrainStatus` necessários), T1 (tipos `JobStatus`, `ModelMetrics`, etc.)
**Reuses**: Padrão de `lib/hooks/useRecommendationFetcher.ts` para async hook com error handling; `sonner` para toasts (já instalado M8)
**Requirement**: M9B-01..M9B-32 (hook é o núcleo de toda a lógica)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Interface retornada: `{ status: JobStatus; epoch: number; totalEpochs: number; loss: number | null; eta: number | null; beforeMetrics: ModelMetrics | null; afterMetrics: ModelMetrics | null; startRetrain: () => void; errorMessage: string | null }`
- [ ] `startRetrain()` chama `postModelTrain(NEXT_PUBLIC_ADMIN_API_KEY)` → seta `status: 'queued'` + `jobId` state + `jobIdRef.current` imediatamente
- [ ] `useEffect([jobId])` sincroniza `jobIdRef.current = jobId` (ADR-025 stale closure fix)
- [ ] `setInterval` usa `jobIdRef.current` (nunca `jobId` da closure)
- [ ] Intervalo de polling: 1s quando `status === 'queued'` ou (`status === 'running'` E `epoch/totalEpochs < 0.5`); 2s quando (`status === 'running'` E `epoch/totalEpochs >= 0.5`) (M9B-18, M9B-19)
- [ ] Polling para ao receber `done` ou `failed` — `clearInterval` imediato (M9B-20)
- [ ] `useEffect` cleanup faz `clearInterval` ao desmontar (M9B-21)
- [ ] `consecutiveErrors` counter: ao atingir 3 → `clearInterval` + `status: 'network-error'` (M9B-29)
- [ ] Ao `done`: seta `afterMetrics` com dados do response + `status: 'done'` (M9B-10, M9B-22)
- [ ] On mount: chama `getModelStatus()` para popular `beforeMetrics` (M9B-08, M9B-09, M9B-13)
- [ ] Edge 409: `toast("Retreinamento já em andamento")` + inicia polling do `jobId` existente se presente no response (M9B-27)
- [ ] Edge 401: `toast.error("Chave de admin não configurada — verifique NEXT_PUBLIC_ADMIN_API_KEY")` + `status: 'idle'` (M9B-28)
- [ ] Edge `totalEpochs === 0 || null`: `epochFraction` retornado como `null` para sinalizar modo indeterminado (M9B-31)
- [ ] `status === 'idle'` inicial — botão habilitado no load (M9B-01)
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (hooks frontend não têm cobertura unitária per TESTING.md — lógica validada via E2E)
**Gate**: quick

**Commit**: `feat(frontend): implement useRetrainJob hook with polling backoff and jobIdRef (ADR-025)`

---

### T5: Criar componente `<TrainingProgressBar>` [P]

**What**: Criar o componente visual de barra de progresso com animação `transform: scaleX()` (ADR-024), textos de estado (epoch/loss/ETA), modo indeterminado via `animate-pulse`, e região `aria-live="polite"` para screen readers.
**Where**: `frontend/components/retrain/TrainingProgressBar.tsx` (novo — criar diretório `retrain/`)
**Depends on**: T1 (tipo `JobStatus` necessário nas props), T4 (hook define shape dos dados que o componente exibe — dependência de contrato de props)
**Reuses**: `cn()` de `lib/utils.ts`; padrão de `ScoreBadge.tsx` para classes condicionais Tailwind
**Requirement**: M9B-03, M9B-04, M9B-05, M9B-06, M9B-07, M9B-24, M9B-25, M9B-26, M9B-31

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Props: `{ status: JobStatus; epoch: number; totalEpochs: number; loss: number | null; eta: number | null }`
- [ ] Container: `role="progressbar"` + `aria-valuenow` + `aria-valuemin={0}` + `aria-valuemax={100}` + `aria-label="Progresso do retreinamento"` (M9B-03, acessibilidade)
- [ ] Fill animado via `style={{ transform: \`scaleX(${fraction})\` }}` + `transform-origin: left` + classe `motion-safe:transition-transform duration-300 ease-out` (ADR-024)
- [ ] `status === 'idle'`: componente não renderizado (`return null`)
- [ ] `status === 'queued'` ou `totalEpochs === 0/null`: fill com `motion-safe:animate-pulse` + texto "Aguardando início..." (M9B-31)
- [ ] `status === 'running'`: fill azul `scaleX(epoch/totalEpochs)` + texto "Epoch N / M — Loss: X.XXXX" (M9B-04)
- [ ] `status === 'running'` + `eta !== null` + `eta > 3`: texto "~Ns restantes" ao lado (M9B-24)
- [ ] `status === 'running'` + `eta !== null` + `eta <= 3`: texto "Finalizando..." (M9B-26)
- [ ] `status === 'running'` + `eta === null`: ETA omitido sem quebrar layout (M9B-25)
- [ ] `status === 'done'`: fill verde 100% + texto "Retreinamento concluído ✅" (M9B-05)
- [ ] `status === 'failed'`: fill vermelho + texto "Retreinamento falhou" (M9B-07)
- [ ] `status === 'network-error'`: fill cinza + texto "Erro de conexão — tente novamente" (M9B-07)
- [ ] `aria-live="polite"` wrapping texto de status para anúncio de screen reader
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (componente React sem cobertura unitária per TESTING.md)
**Gate**: quick

**Commit**: `feat(frontend): create TrainingProgressBar component with scaleX animation (ADR-024)`

---

### T6: Criar componente `<ModelMetricsComparison>` [P]

**What**: Criar o componente de tabela "Antes / Depois" com badges de comparação (↑ Melhora / → Igual / ↓ Regressão), estados de loading com `<Skeleton>`, estado vazio "Nenhum modelo treinado", e fade-in da coluna "Depois" ao concluir o treino.
**Where**: `frontend/components/retrain/ModelMetricsComparison.tsx` (novo — mesmo diretório de T5)
**Depends on**: T1 (tipo `ModelMetrics` nas props), T4 (hook define `beforeMetrics`/`afterMetrics`)
**Reuses**: `Badge` de `components/ui/badge.tsx`; `Skeleton` de `components/ui/skeleton.tsx`; `cn()` de `lib/utils.ts`
**Requirement**: M9B-08, M9B-09, M9B-10, M9B-11, M9B-12, M9B-13

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Props: `{ before: ModelMetrics | null; after: ModelMetrics | null; loading: boolean }`
- [ ] `loading === true`: 4x `<Skeleton>` lines (M9B-08 loading state)
- [ ] `before === null && !loading`: mensagem "Nenhum modelo treinado — clique em Retreinar Modelo para começar" (M9B-13)
- [ ] `before !== null && after === null`: coluna única "Modelo Atual" com `precisionAt5`, `loss`, `epoch`, `trainedAt` formatado (M9B-09)
- [ ] `before !== null && after !== null`: duas colunas "Antes" / "Depois" lado a lado (M9B-10)
- [ ] Badge verde "↑ Melhora" quando `after.precisionAt5 > before.precisionAt5` (M9B-11)
- [ ] Badge amarelo "→ Igual" quando `after.precisionAt5 === before.precisionAt5` (M9B-12)
- [ ] Badge vermelho "↓ Regressão" quando `after.precisionAt5 < before.precisionAt5` (M9B-12)
- [ ] Coluna "Depois" tem `motion-safe:transition-opacity duration-200 ease-out` (fade-in per design animation spec)
- [ ] Grid colapsa para 1 coluna em `< 640px` (design accessibility checklist)
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (componente React sem cobertura unitária per TESTING.md)
**Gate**: quick

**Commit**: `feat(frontend): create ModelMetricsComparison component with before/after badges`

---

### T7: Criar componente `<RetrainPanel>`

**What**: Criar o componente container que agrega `<TrainingProgressBar>`, `<ModelMetricsComparison>` e o botão "🔄 Retreinar Modelo", delegando todo o estado ao `useRetrainJob`.
**Where**: `frontend/components/retrain/RetrainPanel.tsx` (novo — mesmo diretório)
**Depends on**: T5 (`<TrainingProgressBar>`), T6 (`<ModelMetricsComparison>`), T4 (`useRetrainJob`)
**Reuses**: `sonner` toast (já instalado M8); `cn()` de `lib/utils.ts`; padrão de botão desabilitado de `CatalogPanel.tsx`
**Requirement**: M9B-01, M9B-02, M9B-03, M9B-06, M9B-07, M9B-08..M9B-13, M9B-28, M9B-32

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Props: none — componente auto-suficiente (lê env var via adapter, não via prop)
- [ ] Usa `useRetrainJob()` para obter todo o estado
- [ ] Botão "🔄 Retreinar Modelo": `disabled={status !== 'idle' && status !== 'done' && status !== 'failed' && status !== 'network-error'}` + `aria-disabled="true"` quando desabilitado + `min-h-11 px-4` (touch target ≥44px) (M9B-06, acessibilidade)
- [ ] Botão label: "Retreinando..." quando `status === 'queued' || status === 'running'`; "🔄 Retreinar Modelo" nos demais estados (M9B-06)
- [ ] `<TrainingProgressBar>` recebe `status`, `epoch`, `totalEpochs`, `loss`, `eta` do hook
- [ ] `<ModelMetricsComparison>` recebe `before={beforeMetrics}`, `after={afterMetrics}`, `loading={status === 'idle' && beforeMetrics === null}` (skeleton durante load inicial)
- [ ] Edge ai-service fora do ar: `useRetrainJob` já lida com isso — UI restaura botão via `status: 'idle'` (M9B-32)
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (componente React sem cobertura unitária per TESTING.md)
**Gate**: quick

**Commit**: `feat(frontend): create RetrainPanel component wiring useRetrainJob + sub-components`

---

### T8: Integrar `<RetrainPanel>` no `<AnalysisPanel>` + wiring always-mounted no `page.tsx`

**What**: (1) Modificar `AnalysisPanel.tsx` adicionando layout responsivo `lg:grid-cols-2` e `<RetrainPanel>` na coluna direita + `<Tabs>` shadcn para mobile. (2) Modificar `page.tsx` para always-mount `<AnalysisPanel>` com `aria-hidden` (ADR-023).
**Where**:
- `frontend/components/recommendations/AnalysisPanel.tsx` (modificar)
- `frontend/app/page.tsx` (modificar)
**Depends on**: T7 (`<RetrainPanel>`)
**Reuses**: Padrão always-mounted de `<RAGDrawer>` no `Header.tsx` (ADR-018/ADR-023); shadcn `<Tabs>` já instalado (M8); `ClientProfileCard`, `ShuffledColumn`, `RecommendedColumn` — sem modificação
**Requirement**: M9B-14, M9B-15, M9B-16, M9B-17, M9B-22, M9B-23

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `page.tsx`: `<AnalysisPanel>` renderizado incondicionalmente (fora do `{activeTab === 'analysis' && ...}`) envolto em `<div aria-hidden={activeTab !== 'analysis'} className={activeTab !== 'analysis' ? 'hidden' : 'block'}>` (ADR-023) — `useRetrainJob` state NÃO é destruído ao navegar entre abas (M9B-22)
- [ ] `AnalysisPanel.tsx` desktop (`lg:grid-cols-2`): coluna esquerda = `ClientProfileCard` + comparação "Sem IA vs Com IA" (`ShuffledColumn` + `RecommendedColumn`); coluna direita = `<RetrainPanel>` (M9B-14)
- [ ] `AnalysisPanel.tsx` mobile (`< 1024px`): `<Tabs defaultValue="comparacao">` com `<TabsTrigger value="comparacao">📊 Comparação</TabsTrigger>` e `<TabsTrigger value="retreinar">🔄 Retreinar</TabsTrigger>` — triggers `flex-1` para touch targets iguais (M9B-15, acessibilidade)
- [ ] `ClientProfileCard` existente não é removido nem modificado (M9B-17)
- [ ] `ShuffledColumn` e `RecommendedColumn` existentes não são modificados (M9B-17)
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings (M9B-16)

**Tests**: none (componente React sem cobertura unitária per TESTING.md)
**Gate**: quick

**Commit**: `feat(frontend): integrate RetrainPanel into AnalysisPanel + always-mount wiring in page.tsx (ADR-023)`

---

### T9: E2E Playwright — `m9b-deep-retrain.spec.ts`

**What**: Criar spec Playwright cobrindo o fluxo completo do M9-B: painel visível → clicar Retreinar → barra de progresso visível + botão desabilitado → conclusão → métricas Antes/Depois → layout responsivo → persistência entre abas.
**Where**: `frontend/e2e/tests/m9b-deep-retrain.spec.ts` (novo)
**Depends on**: T8 (integração completa disponível)
**Reuses**: Padrão de `m9a-demo-buy.spec.ts` e `m8-ux-journey.spec.ts`: `page.goto('/')` + `waitForLoadState('networkidle')`, locators por texto visível, `waitFor({ state: 'attached/detached' })`
**Requirement**: M9B-01..M9B-32 (validação E2E end-to-end de todos os requisitos P1, P2 e casos críticos de edge)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Teste 1 — painel visível: navega para aba "Análise" → verifica que botão "🔄 Retreinar Modelo" está visível e habilitado (M9B-01)
- [ ] Teste 2 — fluxo completo de retrain: clica "🔄 Retreinar Modelo" → verifica barra de progresso aparece (M9B-03) → verifica botão fica desabilitado com texto "Retreinando..." (M9B-06) → aguarda status "done" → verifica barra 100% + "Retreinamento concluído ✅" (M9B-05) → verifica colunas "Antes" e "Depois" com métricas (M9B-10) → verifica badge de comparação presente (M9B-11 ou M9B-12)
- [ ] Teste 3 — persistência entre abas: retrain → navega para "Catálogo" → retorna para "Análise" → verifica métricas "Depois" ainda visíveis (M9B-22)
- [ ] Teste 4 — layout mobile: viewport 375px → navega para aba "Análise" → verifica tabs internas "📊 Comparação" e "🔄 Retreinar" presentes (M9B-15) → clica tab "🔄 Retreinar" → verifica `<RetrainPanel>` visível
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Build gate passa: `npm run lint && npm run build && npm run test:e2e` — ESLint ✓, build ✓, E2E spec ✓ (M9B-16)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(frontend): add Playwright E2E spec for M9-B Deep Retrain Showcase`

---

## Parallel Execution Map

```
Phase 1 (Parcialmente Paralela — Types primeiro, depois adapters + proxy em paralelo):
  T1 ──→ T2 [P]
         T3 [P]

Phase 2 (Sequential — Hook depende dos adapters):
  T2 ──→ T4

Phase 3 (Parallel — Componentes folha independentes):
  T4 complete, then:
    ├── T5 [P]  ─┐
    └── T6 [P]  ─┤──→ T7

Phase 4 (Sequential — Integração + E2E):
  T7 ──→ T8 ──→ T9
```

**Nota sobre T2 e T3:** Ambas dependem de T1 mas não entre si — podem ser delegadas para sub-agentes em paralelo.

---

## Task Granularity Check

| Task | Scope | Status |
|------|-------|--------|
| T1: Tipos em lib/types.ts | 1 arquivo, 5 tipos/interfaces adicionados | ✅ Granular |
| T2: lib/adapters/train.ts | 1 arquivo novo, 3 funções coesas do mesmo domínio | ✅ OK (coesas, mesmo arquivo) |
| T3: 3 proxy routes | 3 arquivos de rota — estrutura repetitiva e coesa | ✅ OK (padrão estabelecido para proxy) |
| T4: useRetrainJob hook | 1 arquivo, 1 hook com toda a lógica de polling | ✅ Granular |
| T5: TrainingProgressBar | 1 componente | ✅ Granular |
| T6: ModelMetricsComparison | 1 componente | ✅ Granular |
| T7: RetrainPanel | 1 componente container | ✅ Granular |
| T8: AnalysisPanel + page.tsx | 2 arquivos — modificação coesa (integração) | ✅ OK (sempre modifica par AnalysisPanel/page.tsx juntos per ADR-023) |
| T9: E2E spec | 1 arquivo de spec | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|------|------------------------|---------------|--------|
| T1 | None | Início de Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 [P] | ✅ Match |
| T3 | T1 | T1 → T3 [P] | ✅ Match |
| T4 | T2, T1 | T2 → T4 | ✅ Match (T1 transitivo via T2) |
| T5 | T1, T4 | T4 → T5 [P] | ✅ Match |
| T6 | T1, T4 | T4 → T6 [P] | ✅ Match |
| T7 | T5, T6, T4 | T5, T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|------|-----------------------------|-----------------|-----------|--------|
| T1: Tipos lib/types.ts | `lib/types.ts` | **nenhum** (per TESTING.md) | none | ✅ OK |
| T2: lib/adapters/train.ts | `lib/adapters/` | **nenhum** (per TESTING.md) | none | ✅ OK |
| T3: 3 proxy routes | `app/api/proxy/*` (Route Handlers) | **nenhum** (per TESTING.md) | none | ✅ OK |
| T4: useRetrainJob hook | hook (sem categoria explícita) | **nenhum** — hooks são validados via E2E (per TESTING.md) | none | ✅ OK |
| T5: TrainingProgressBar | Componente React | **nenhum** (per TESTING.md) | none | ✅ OK |
| T6: ModelMetricsComparison | Componente React | **nenhum** (per TESTING.md) | none | ✅ OK |
| T7: RetrainPanel | Componente React | **nenhum** (per TESTING.md) | none | ✅ OK |
| T8: AnalysisPanel + page.tsx | Componentes React | **nenhum** (per TESTING.md) | none | ✅ OK |
| T9: E2E spec | Fluxo E2E completo | Playwright | e2e | ✅ OK |

---

## Requirement Traceability

| Requirement | Covered by |
|-------------|------------|
| M9B-01 | T4, T7, T9 |
| M9B-02 | T2, T3, T7, T9 |
| M9B-03 | T5, T7, T9 |
| M9B-04 | T4, T5, T9 |
| M9B-05 | T4, T5, T9 |
| M9B-06 | T4, T7, T9 |
| M9B-07 | T4, T5, T7 |
| M9B-08 | T2, T4, T7 |
| M9B-09 | T6, T7 |
| M9B-10 | T4, T6, T7, T9 |
| M9B-11 | T6, T9 |
| M9B-12 | T6 |
| M9B-13 | T4, T6 |
| M9B-14 | T8 |
| M9B-15 | T8, T9 |
| M9B-16 | T9 |
| M9B-17 | T8 |
| M9B-18 | T4 |
| M9B-19 | T4 |
| M9B-20 | T4 |
| M9B-21 | T4 |
| M9B-22 | T8, T9 |
| M9B-23 | T4 |
| M9B-24 | T5 |
| M9B-25 | T5 |
| M9B-26 | T5 |
| M9B-27 | T4 |
| M9B-28 | T2, T4 |
| M9B-29 | T4 |
| M9B-30 | T4 |
| M9B-31 | T1, T4, T5 |
| M9B-32 | T4, T7 |

**Coverage:** 32/32 requirements mapped ✅

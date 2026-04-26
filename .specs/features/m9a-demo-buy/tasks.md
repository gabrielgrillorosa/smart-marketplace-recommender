# M9-A — Demo Buy + Live Reorder — Tasks

**Design**: `.specs/features/m9a-demo-buy/design.md`
**Spec**: `.specs/features/m9a-demo-buy/spec.md`
**Status**: Complete ✅

---

## Execution Plan

### Phase 1: AI Service Foundation (Sequential)

Novas exportações, novos métodos no Neo4jRepository e novo serviço — sem dependências entre si, mas o T3 (service) depende de T1 e T2.

```
T1 → T2 → T3
```

### Phase 2: AI Service Routes (Sequential)

Rota e wiring no index dependem do T3 (DemoBuyService).

```
T3 → T4 → T5
```

### Phase 3: Frontend — demoSlice + ProductCard (Paralelo)

Com o backend disponível, os dois lados do frontend não têm dependência entre si.

```
     ┌→ T6 ─┐
T5 ──┤       ├──→ T8
     └→ T7 ─┘
```

### Phase 4: Frontend — CatalogPanel Wiring + E2E (Sequential)

CatalogPanel conecta tudo; E2E fecha o ciclo.

```
T6, T7 → T8 → T9
```

---

## Task Breakdown

### T1: Exportar `meanPooling` e `cosine` como named exports [P]

**What**: Adicionar `export` às funções `meanPooling` e `cosine` em `RecommendationService.ts` para uso em `DemoBuyService` e testes sem duplicação.
**Where**: `ai-service/src/services/RecommendationService.ts`
**Depends on**: None
**Reuses**: Funções já existentes — apenas adicionar `export` keyword
**Requirement**: M9A-09, M9A-10

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `export function meanPooling(...)` e `export function cosine(...)` no arquivo
- [ ] `import { meanPooling } from '../services/RecommendationService'` compila sem erro
- [ ] Nenhum teste existente quebra (as funções são puras — nenhum comportamento muda)
- [ ] Gate check passa: `npm test` — 42 testes passam (sem deleção silenciosa)

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(ai-service): export meanPooling and cosine as named exports`

---

### T2: Adicionar 3 métodos ao Neo4jRepository [P]

**What**: Implementar `createDemoBoughtAndGetEmbeddings`, `deleteDemoBoughtAndGetEmbeddings`, e `clearAllDemoBoughtAndGetEmbeddings` no Neo4jRepository, cada um usando `session.executeWrite()` com transação unificada (ADR-021).
**Where**: `ai-service/src/repositories/Neo4jRepository.ts`
**Depends on**: None
**Reuses**: Padrão `session.executeWrite()` já estabelecido no repositório; `getClientPurchasedEmbeddings()` como referência de Cypher
**Requirement**: M9A-08, M9A-09, M9A-14, M9A-16, M9A-26

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `createDemoBoughtAndGetEmbeddings(clientId, productId): Promise<number[][]>` — MERGE `[:BOUGHT {is_demo: true, date: datetime()}]` + retorna embeddings de todos `:BOUGHT` do cliente `WHERE embedding IS NOT NULL`, na mesma `session.executeWrite()`
- [ ] `deleteDemoBoughtAndGetEmbeddings(clientId, productId): Promise<number[][]>` — DELETE edge `is_demo: true` para o par + retorna embeddings restantes na mesma transação
- [ ] `clearAllDemoBoughtAndGetEmbeddings(clientId): Promise<number[][]>` — DELETE todas edges `is_demo: true` do cliente + retorna embeddings de compras reais restantes
- [ ] Todos os 3 métodos lançam `ClientNotFoundError` se `clientId` não existe
- [ ] `createDemoBoughtAndGetEmbeddings` lança `ProductNotFoundError` (novo, seguindo padrão de `ClientNotFoundError`) se `productId` não existe
- [ ] TypeScript compila sem erros: `tsc --noEmit`
- [ ] Gate check passa: `npm test` — 42 testes passam (Neo4jRepository não tem testes — sem gate de unit; gate cobre regressão nas funções exportadas)

**Tests**: none (Neo4jRepository não tem cobertura de unit per TESTING.md — a camada é validada via smoke tests no Execute)
**Gate**: quick

**Commit**: `feat(ai-service): add 3 demo-buy methods to Neo4jRepository (ADR-021)`

---

### T3: Implementar `DemoBuyService` com unit tests

**What**: Criar `DemoBuyService.ts` com os métodos `demoBuy`, `undoDemoBuy`, `clearAllDemoBought` — orquestrando `Neo4jRepository` + `meanPooling` + `RecommendationService.recommendFromVector()`. Incluir unit tests com mocks.
**Where**: `ai-service/src/services/DemoBuyService.ts` (novo) + `ai-service/src/services/DemoBuyService.test.ts` (novo)
**Depends on**: T1 (meanPooling exportado), T2 (métodos Neo4jRepository disponíveis)
**Reuses**: Padrão constructor DI de `RecommendationService`; `meanPooling` de T1; erro `ClientNoPurchaseHistoryError` (novo)
**Requirement**: M9A-08, M9A-09, M9A-10, M9A-12, M9A-15, M9A-16, M9A-17, M9A-26, M9A-27, M9A-28, M9A-31, M9A-32

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `class DemoBuyService` com constructor `(repo: Neo4jRepository, recommendationService: RecommendationService)`
- [ ] `async demoBuy(clientId, productId, limit): Promise<RecommendationResult[]>` — chama `createDemoBoughtAndGetEmbeddings` → `meanPooling` → `recommendFromVector`; lança `ClientNoPurchaseHistoryError` (422) se `embeddings.length === 0` após cold start sem embedding
- [ ] `async undoDemoBuy(clientId, productId, limit): Promise<RecommendationResult[]>` — chama `deleteDemoBoughtAndGetEmbeddings` → `meanPooling` → `recommendFromVector`
- [ ] `async clearAllDemoBought(clientId, limit): Promise<RecommendationResult[]>` — chama `clearAllDemoBoughtAndGetEmbeddings` → `meanPooling` → `recommendFromVector`; retorna array vazio se `embeddings.length === 0` (idempotente)
- [ ] Unit tests cobrem: demoBuy sucesso, demoBuy cold start (M9A-32), undoDemoBuy sucesso, clearAllDemoBought com 0 demos (M9A-28), produto com embedding null excluído silenciosamente (M9A-31)
- [ ] TypeScript compila: `tsc --noEmit`
- [ ] Gate check passa: `npm test` — 42 + N novos testes (N ≥ 5) passam; nenhuma deleção silenciosa

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ai-service): implement DemoBuyService with unit tests`

---

### T4: Implementar `recommendFromVector` no RecommendationService com unit tests

**What**: Adicionar método `recommendFromVector(clientId, limit, profileVector)` à classe `RecommendationService` — reutiliza `getClientWithCountry`, `getPurchasedProductIds`, `getCandidateProducts`, e o scoring `tf.tidy()` com `profileVector` externo em vez de calculá-lo internamente.
**Where**: `ai-service/src/services/RecommendationService.ts` (modificar) + `ai-service/src/tests/recommend.test.ts` (adicionar casos)
**Depends on**: T3 (DemoBuyService precisa do método para compilar — dependência de tipo)
**Reuses**: Lógica de scoring existente em `recommend()`; `getCandidateProducts`, `getPurchasedProductIds`, `getClientWithCountry` já no repositório
**Requirement**: M9A-10, M9A-11, M9A-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `async recommendFromVector(clientId: string, limit: number, profileVector: number[]): Promise<RecommendResponse>` adicionado à classe
- [ ] Método usa `profileVector` recebido diretamente no scoring `tf.tidy()` — sem recalcular mean-pooling
- [ ] `recommend()` existente não é alterado — zero risco de regressão
- [ ] Unit tests adicionados em `recommend.test.ts`: `recommendFromVector` com profileVector mockado, `recommendFromVector` com `clientId` inexistente (404)
- [ ] TypeScript compila: `tsc --noEmit`
- [ ] Gate check passa: `npm test` — 42 + N testes de T3 + M novos passam (M ≥ 2); nenhuma deleção silenciosa

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ai-service): add recommendFromVector method to RecommendationService`

---

### T5: Implementar `demoBuyRoutes.ts` + wiring no `index.ts` com integration tests

**What**: Criar `demoBuyRoutes.ts` com os 3 endpoints (`POST /demo-buy`, `DELETE /demo-buy/:clientId/:productId`, `DELETE /demo-buy/:clientId`) + mapeamento de erros para HTTP codes + registrar no `index.ts`. Incluir integration tests com Fastify test instance.
**Where**: `ai-service/src/routes/demoBuyRoutes.ts` (novo) + `ai-service/src/routes/demoBuyRoutes.test.ts` (novo) + `ai-service/src/index.ts` (modificar)
**Depends on**: T3 (DemoBuyService), T4 (recommendFromVector)
**Reuses**: Padrão de rota de `recommendRoutes.ts`; `buildServer()` helper dos testes de `adminRoutes.test.ts`; schema de validação JSON Schema do Fastify (padrão já em uso)
**Requirement**: M9A-02, M9A-08, M9A-11, M9A-12, M9A-13, M9A-14, M9A-15, M9A-16, M9A-17, M9A-26, M9A-27, M9A-28

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `POST /api/v1/demo-buy` — body `{ clientId, productId, limit? }` — resposta `200 { recommendations: RecommendationResult[] }`
- [ ] `DELETE /api/v1/demo-buy/:clientId/:productId` — sem body (ADR-022) — resposta `200 { recommendations: [] }`
- [ ] `DELETE /api/v1/demo-buy/:clientId` — sem body (ADR-022) — resposta `200 { recommendations: [] }`
- [ ] Mapeamento de erros: `ClientNotFoundError` / `ProductNotFoundError` → 404; body inválido → 400; `ClientNoPurchaseHistoryError` → 422; `Neo4jUnavailableError` / `ModelNotTrainedError` → 503
- [ ] `demoBuyRoutes` registrado em `index.ts` com `fastify.register(demoBuyRoutes, { prefix: '/api/v1' })`
- [ ] Integration tests: POST sucesso (mock DemoBuyService), POST 404, POST 400, DELETE individual sucesso, DELETE bulk sucesso
- [ ] `tsc --noEmit` limpo; `npm run lint` 0 warnings
- [ ] Gate check passa: `npm run lint && npm test` — todos os testes passam; nenhuma deleção silenciosa

**Tests**: integration
**Gate**: full

**Commit**: `feat(ai-service): implement demoBuyRoutes with integration tests`

---

### T6: Atualizar `demoSlice.ts` — adicionar loading state e actions [P]

**What**: Adicionar `demoBuyLoading: Record<string, boolean>` e `setDemoBuyLoading(productId, loading)` ao `demoSlice`, além das actions `addDemoBought`, `removeDemoBought`, `clearDemoForClient` se ainda não presentes.
**Where**: `frontend/src/store/demoSlice.ts`
**Depends on**: T5 (rotas de backend disponíveis para o frontend consumir — dependência de contrato, não de compilação)
**Reuses**: Shape existente de `demoSlice`; padrão Zustand de outros slices
**Requirement**: M9A-03, M9A-05, M9A-06, M9A-23, M9A-24, M9A-25, M9A-29, M9A-33

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `demoBuyLoading: Record<string, boolean>` adicionado à interface e estado inicial
- [ ] `setDemoBuyLoading(productId: string, loading: boolean): void` adicionado
- [ ] `addDemoBought(clientId: string, productId: string): void` — adiciona ao set de compras demo do cliente
- [ ] `removeDemoBought(clientId: string, productId: string): void` — remove do set
- [ ] `clearDemoForClient(clientId: string): void` — limpa todas as demos do cliente (chamado ao trocar de cliente)
- [ ] `demoBoughtByClient: Record<string, string[]>` exposto no slice (array de productIds por clientId)
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (frontend sem unit tests per TESTING.md)
**Gate**: quick

**Commit**: `feat(frontend): extend demoSlice with loading state and demo-buy actions`

---

### T7: Atualizar `ProductCard.tsx` — adicionar Demo Buy button e badge [P]

**What**: Adicionar os novos props opcionais `isDemo`, `isDemoBuyLoading`, `onDemoBuy`, `onDemoUndo`, `showDemoBuy` ao `ProductCard` e renderizar o botão "🛒 Demo Comprar" / "↩ Desfazer" + badge "demo" com base nesses props.
**Where**: `frontend/src/components/ProductCard/ProductCard.tsx` (ou caminho equivalente)
**Depends on**: T5 (contrato de API), T6 (loading state disponível no slice)
**Reuses**: `ScoreBadge` existente como referência de padrão de badge; `sonner` para feedback (já instalado M8)
**Requirement**: M9A-01, M9A-03, M9A-04, M9A-05, M9A-06, M9A-07, M9A-19, M9A-29

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Props opcionais adicionadas sem quebrar usos existentes (todos os callers passam sem os novos props → comportamento idêntico ao anterior)
- [ ] `showDemoBuy && !isDemo` → renderiza botão `🛒 Demo Comprar` (desabilitado se `isDemoBuyLoading`)
- [ ] `isDemo` → renderiza badge `demo` (Tailwind classe `warning` ou `yellow`) + botão `↩ Desfazer`
- [ ] Botão desabilitado com cursor `not-allowed` e opacity reduzida durante `isDemoBuyLoading` (M9A-29)
- [ ] `!showDemoBuy && !isDemo` → nenhum botão extra visível (comportamento retrocompatível)
- [ ] TypeScript compila: `tsc --noEmit`
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (frontend sem unit tests per TESTING.md)
**Gate**: quick

**Commit**: `feat(frontend): add Demo Buy button and demo badge to ProductCard`

---

### T8: Wiring do CatalogPanel — handlers + toolbar "Limpar Demo"

**What**: Conectar `demoSlice` ao `CatalogPanel`: passar `isDemo`, `isDemoBuyLoading`, `showDemoBuy`, `onDemoBuy`, `onDemoUndo` para cada `ProductCard` via `renderItem`; implementar `handleDemoBuy`, `handleDemoUndo`, `handleClearAllDemo`; adicionar botão "🗑 Limpar Demo (N)" na toolbar.
**Where**: `frontend/src/components/CatalogPanel/CatalogPanel.tsx` (ou caminho equivalente)
**Depends on**: T6 (demoSlice com loading state), T7 (ProductCard com novos props)
**Reuses**: `useAppStore` pattern de outros painéis; `fetch` via proxy route existente (`/api/ai/*`); `sonner` para error toasts (M9A-30)
**Requirement**: M9A-01, M9A-02, M9A-03, M9A-04, M9A-05, M9A-06, M9A-07, M9A-15, M9A-18, M9A-19, M9A-20, M9A-21, M9A-22, M9A-29, M9A-30

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `handleDemoBuy(productId)`: `setDemoBuyLoading(productId, true)` → `POST /api/ai/demo-buy` → `setRecommendations(response)` + `addDemoBought(clientId, productId)` → `setDemoBuyLoading(productId, false)`; catch → `toast.error(...)` + `setDemoBuyLoading(productId, false)` (M9A-30)
- [ ] `handleDemoUndo(productId)`: `DELETE /api/ai/demo-buy/:clientId/:productId` → `setRecommendations` + `removeDemoBought(clientId, productId)`
- [ ] `handleClearAllDemo()`: `DELETE /api/ai/demo-buy/:clientId` → `setRecommendations` + `clearDemoForClient(clientId)`
- [ ] Toolbar exibe botão "🗑 Limpar Demo (N)" somente quando `demoBoughtByClient[clientId].length > 0` (M9A-20)
- [ ] `showDemoBuy` = `isAiOrdered && selectedClient != null` passado para cada ProductCard
- [ ] `isDemo` = `demoBoughtByClient[clientId]?.includes(productId)` por card
- [ ] TypeScript compila: `tsc --noEmit`
- [ ] Gate check passa: `npm run lint && npm run build` — build ✓, ESLint ✓ 0 warnings

**Tests**: none (frontend sem unit tests per TESTING.md)
**Gate**: quick

**Commit**: `feat(frontend): wire demo-buy handlers and Limpar Demo toolbar to CatalogPanel`

---

### T9: Adicionar proxy routes Next.js para demo-buy + E2E Playwright

**What**: Criar route handlers Next.js (`/api/ai/demo-buy`) para os 3 endpoints demo-buy (seguindo padrão do proxy existente). Adicionar spec Playwright `m9a-demo-buy.spec.ts` cobrindo o fluxo completo: selecionar cliente → ordenar por IA → demo comprar → verificar reordenação → desfazer → limpar demo.
**Where**: `frontend/src/app/api/ai/demo-buy/route.ts` (novo, ou padrão existente do proxy) + `e2e/tests/m9a-demo-buy.spec.ts` (novo)
**Depends on**: T8 (CatalogPanel com wiring completo)
**Reuses**: Route handler proxy pattern de `app/api/ai/recommend/route.ts`; padrão de E2E de `m8-ux-journey.spec.ts` (waitForLoadState, locators por texto visível)
**Requirement**: M9A-01 a M9A-33 (validação E2E end-to-end)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Proxy routes criadas: `POST /api/ai/demo-buy` → `POST http://ai-service:3001/api/v1/demo-buy`; `DELETE /api/ai/demo-buy/[clientId]/[productId]` → DELETE correspondente; `DELETE /api/ai/demo-buy/[clientId]` → DELETE bulk
- [ ] E2E spec cobre: (1) fluxo completo demo-buy → reordenação animada (M9A-02..M9A-04); (2) badge "demo" visível + botão "↩ Desfazer" (M9A-05, M9A-06); (3) desfazer → badge desaparece (M9A-19); (4) "🗑 Limpar Demo" visível com count + limpa tudo (M9A-20..M9A-22); (5) trocar de cliente → zero badges no novo cliente (M9A-23, M9A-24)
- [ ] `tsc --noEmit` no frontend sem erros
- [ ] Build gate passa: `npm run lint && npm run build && npm run test:e2e` — ESLint ✓, build ✓, E2E spec ✓

**Tests**: e2e
**Gate**: build

**Commit**: `feat(frontend): add demo-buy proxy routes and Playwright E2E spec (M9A)`

---

## Parallel Execution Map

```
Phase 1 (Sequential — AI Service foundation):
  T1 [P note: independente mas inicia a cadeia] ──→ T2 [P: independente] ──→ T3

Phase 2 (Sequential — AI Service routes):
  T3 ──→ T4 ──→ T5

Phase 3 (Parallel — Frontend slices independentes):
  T5 complete, then:
    ├── T6 [P]  ─┐
    └── T7 [P]  ─┤──→ T8
                 ┘

Phase 4 (Sequential — Wiring + E2E):
  T8 ──→ T9
```

**Nota sobre T1 e T2:** Ambas são independentes entre si e podem ser executadas em paralelo. São listadas como T1 → T2 apenas para clareza narrativa; na prática `[P]` é permitido para ambas.

---

## Task Granularity Check

| Task | Scope | Status |
|------|-------|--------|
| T1: Exportar meanPooling e cosine | 1 arquivo, 2 keywords `export` | ✅ Granular |
| T2: 3 métodos Neo4jRepository | 1 arquivo, 3 métodos coesos de mesmo domínio | ✅ OK (coesos, mesmo arquivo) |
| T3: DemoBuyService + tests | 1 serviço + 1 test file | ✅ Granular |
| T4: recommendFromVector + tests | 1 método em arquivo existente + N test cases | ✅ Granular |
| T5: demoBuyRoutes + wiring + tests | 1 arquivo de rota + 1 test file + 3 linhas no index | ✅ Granular |
| T6: demoSlice loading state | 1 arquivo de slice | ✅ Granular |
| T7: ProductCard new props | 1 componente | ✅ Granular |
| T8: CatalogPanel wiring | 1 componente | ✅ Granular |
| T9: Proxy routes + E2E | 1 proxy file + 1 E2E spec | ✅ OK (coesos, último task de feature) |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|------|------------------------|---------------|--------|
| T1 | None | Início de Phase 1 | ✅ Match |
| T2 | None | Phase 1 independente | ✅ Match |
| T3 | T1, T2 | T1 → T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T3, T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 [P] | ✅ Match |
| T7 | T5, T6 | T5 → T7 [P] (T6 como pré-req de contrato de slice) | ✅ Match |
| T8 | T6, T7 | T6, T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|------|-----------------------------|-----------------|-----------|--------|
| T1: Exportar meanPooling/cosine | `RecommendationService` (modificação mínima) | Unit (Vitest) | unit | ✅ OK |
| T2: Neo4jRepository 3 métodos | `Neo4jRepository` | **não testado** (per TESTING.md) | none | ✅ OK |
| T3: DemoBuyService | Novo service | Unit (Vitest) | unit | ✅ OK |
| T4: recommendFromVector | `RecommendationService` | Unit (Vitest) | unit | ✅ OK |
| T5: demoBuyRoutes | Routes (integration) | Integration (Vitest) | integration | ✅ OK |
| T6: demoSlice | Zustand slice | **nenhum** (per TESTING.md) | none | ✅ OK |
| T7: ProductCard | React component | **nenhum** (per TESTING.md) | none | ✅ OK |
| T8: CatalogPanel | React component | **nenhum** (per TESTING.md) | none | ✅ OK |
| T9: Proxy routes + E2E | Route Handler + E2E flow | E2E (Playwright) | e2e | ✅ OK |

---

## Requirement Traceability

| Requirement | Covered by |
|-------------|------------|
| M9A-01 | T7, T8 |
| M9A-02 | T5, T8 |
| M9A-03 | T6, T7, T8 |
| M9A-04 | T8 |
| M9A-05 | T7, T8 |
| M9A-06 | T7, T8 |
| M9A-07 | T7, T8 |
| M9A-08 | T2, T5 |
| M9A-09 | T2, T3 |
| M9A-10 | T3, T4 |
| M9A-11 | T4, T5 |
| M9A-12 | T2, T3, T5 |
| M9A-13 | T5 |
| M9A-14 | T2, T5 |
| M9A-15 | T5, T8 |
| M9A-16 | T2, T5 |
| M9A-17 | T3, T5 |
| M9A-18 | T8 |
| M9A-19 | T7, T8 |
| M9A-20 | T8 |
| M9A-21 | T8, T9 |
| M9A-22 | T8, T9 |
| M9A-23 | T6, T8 |
| M9A-24 | T6, T8 |
| M9A-25 | T6 |
| M9A-26 | T2, T5 |
| M9A-27 | T3, T5 |
| M9A-28 | T3, T5 |
| M9A-29 | T6, T7, T8 |
| M9A-30 | T8 |
| M9A-31 | T3 |
| M9A-32 | T3 |
| M9A-33 | T6 |

**Coverage:** 33/33 requirements mapped ✅

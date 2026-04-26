# M8 — UX Journey Refactor: Tasks

**Design**: `.specs/features/m8-ux-journey-refactor/design.md`
**Spec**: `.specs/features/m8-ux-journey-refactor/spec.md`
**Status**: Draft

> **Gate commands** (derived from M7 conventions — no TESTING.md):
> - **Frontend quick gate**: `npm run lint --prefix frontend`
> - **Frontend build gate**: `npm run build --prefix frontend && npm run lint --prefix frontend`
> - **E2E gate**: `npx playwright test --config frontend/e2e/playwright.config.ts`
> - **Full build gate**: `npm run build --prefix frontend && npm run lint --prefix frontend && npx playwright test --config frontend/e2e/playwright.config.ts`

---

## Execution Plan

### Phase 1: Sprint 0 — Foundation (Sequential)

Install tooling and create the Zustand store before any feature code can reference it.

```
T1 → T2 → T3
```

### Phase 2: Core Components (Parallel OK after T3)

`ReorderableGrid`, `ClientSelectorDropdown`, and `RAGDrawer` all depend only on the store from Phase 1. They have no dependencies on each other.

```
T3 complete, then:
    ├── T4 [P]   ← ReorderableGrid (FLIP animation)
    ├── T5 [P]   ← ClientSelectorDropdown (navbar)
    └── T6 [P]   ← RAGDrawer (Sheet always-mounted)
```

### Phase 3: Catalog Feature (Sequential after T4 + T5)

Catalog toolbar depends on `ReorderableGrid` (T4) for the grid and on the store (T3) for `useCatalogOrdering`. `ScoreBadge` depends on the `ProductCard` prop extension inside T7.

```
T4, T5 complete, then:
    T7 → T8
```

### Phase 4: Header Wiring + Layout Migration (Sequential after T5 + T6 + T7)

Wire all new components into `Header` and strip legacy Providers from `layout.tsx`. Depends on all three parallel components (T5, T6) and ProductCard changes (T7).

```
T5, T6, T7 complete, then:
    T9 → T10
```

### Phase 5: P2 Refinements (Parallel OK after T10)

`ClientPanel` and `RecommendationPanel` read from the Zustand store — depend on T9/T10 for migration being complete.

```
T10 complete, then:
    ├── T11 [P]   ← ClientPanel read-only migration
    └── T12 [P]   ← RecommendationPanel + banner
```

### Phase 6: Toast + E2E (Sequential after T12)

Toast must be wired before E2E so the Playwright suite can assert on it.

```
T11, T12 complete, then:
    T13 → T14
```

---

## Task Breakdown

### T1: Install `zustand` and `tailwindcss-animate`

**What**: Install `zustand` as a production dependency and `tailwindcss-animate` as a dev dependency; register `tailwindcss-animate` in `tailwind.config.ts` so Sheet keyframes work.
**Where**: `frontend/package.json`, `frontend/tailwind.config.ts`
**Depends on**: None
**Reuses**: Existing `tailwind.config.ts` plugin array pattern

**Tools**:
- MCP: `filesystem` (read package.json + tailwind.config.ts before editing), `context7` (verify zustand + tailwindcss-animate current API/install syntax)
- Skill: `coding-guidelines`

**Done when**:
- [ ] `package.json` contains `"zustand"` in `dependencies`
- [ ] `package.json` contains `"tailwindcss-animate"` in `devDependencies`
- [ ] `tailwind.config.ts` registers `require("tailwindcss-animate")` in `plugins`
- [ ] `npm run build --prefix frontend` exits 0

**Tests**: none
**Gate**: quick (`npm run lint --prefix frontend`)

---

### T2: Create Zustand store — `clientSlice` + `demoSlice` + `recommendationSlice` + `useAppStore`

**What**: Create the three Zustand slices and the unified `useAppStore` hook with `persist` on `clientSlice`; cross-slice dependency so `setSelectedClient` calls `clearDemoForClient(previousClientId)`.
**Where**:
- `frontend/src/store/clientSlice.ts` (new)
- `frontend/src/store/demoSlice.ts` (new)
- `frontend/src/store/recommendationSlice.ts` (new)
- `frontend/src/store/index.ts` (new)
**Depends on**: T1
**Reuses**: Design data models from `design.md` (exact state shapes)

**Tools**:
- MCP: `filesystem` (read design.md for exact state shapes), `context7` (verify zustand `create`, `persist`, slice pattern for current version)
- Skill: `coding-guidelines`

**Done when**:
- [ ] `clientSlice` exports `{ selectedClient, setSelectedClient, clearSelectedClient }` with `persist` key `smr-client` (M8-02)
- [ ] `demoSlice` exports `{ demoBoughtByClient, chatHistory, addDemoBought, removeDemoBought, clearDemoForClient, setChatHistory }` without `persist` (M8-03)
- [ ] `recommendationSlice` exports `{ recommendations, loading, isFallback, ordered, cachedForClientId, setRecommendations, setLoading, setOrdered, clearRecommendations }` without `persist`
- [ ] `setSelectedClient` calls `clearDemoForClient(previousClientId)` AND `clearRecommendations()` before updating (M8-04, M8-30)
- [ ] `useAppStore` re-exports all three slices via `create<CombinedStore>()` (M8-05)
- [ ] `tsc --noEmit` exits 0 with no type errors
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: unit
**Gate**: quick

---

### T3: Create domain hooks — `useSelectedClient`, `useRecommendations`, `useCatalogOrdering`, `useRecommendationFetcher`

**What**: Create four domain hooks that abstract the store shape from components; `useRecommendationFetcher` encapsulates the `POST /api/proxy/recommend` call and writes to `recommendationSlice`.
**Where**:
- `frontend/src/lib/hooks/useSelectedClient.ts` (new)
- `frontend/src/lib/hooks/useRecommendations.ts` (new)
- `frontend/src/lib/hooks/useCatalogOrdering.ts` (new)
- `frontend/src/lib/hooks/useRecommendationFetcher.ts` (new)
**Depends on**: T2
**Reuses**: `frontend/src/lib/fetch-wrapper.ts` in `useRecommendationFetcher`

**Tools**:
- MCP: `filesystem` (read fetch-wrapper.ts to match existing apiFetch signature)
- Skill: `coding-guidelines`, `react-best-practices` (`rerender-defer-reads` — `useRecommendationFetcher.fetch` captured via ref to avoid stale closure)

**Done when**:
- [ ] `useSelectedClient()` returns `{ selectedClient, setSelectedClient, clearSelectedClient }`
- [ ] `useRecommendations()` returns `{ recommendations, loading, isFallback, cachedForClientId }`
- [ ] `useCatalogOrdering()` returns `{ ordered, toggle: () => void, reset: () => void }`; `toggle` flips `ordered`; `reset` sets `ordered = false`
- [ ] `useRecommendationFetcher()` returns `{ fetch: (clientId: string) => Promise<void> }`; skips fetch if `cachedForClientId === clientId` (M8-26); sets `loading` in slice; calls `apiFetch` at `POST /api/proxy/recommend` (M8-25)
- [ ] Double-click guard: `useRecommendationFetcher.fetch` returns early if `loading === true` (M8 edge case)
- [ ] `tsc --noEmit` exits 0
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: unit
**Gate**: quick

---

### T4: Create `<ReorderableGrid>` with FLIP animation [P]

**What**: Generic grid component with `prevPositionsRef` + double `useLayoutEffect` FLIP pattern (ADR-017); no `flushSync`; only `transform: translate` animated (GPU-composited); `motion-safe:transition-transform`; `aria-live="polite"`.
**Where**: `frontend/src/components/ReorderableGrid/ReorderableGrid.tsx` (new)
**Depends on**: T3
**Reuses**: ADR-017 pattern (prevPositionsRef, requestAnimationFrame two-frame approach)

**Tools**:
- MCP: `filesystem` (read ADR-017 before writing the FLIP implementation)
- Skill: `coding-guidelines`, `react-best-practices` (`rerender-use-ref-transient-values` for prevPositionsRef; `rendering-animate-svg-wrapper` — same principle: animate transform on wrapper, not inner content)

**Done when**:
- [ ] Props match design: `items: T[]`, `getKey`, `getScore`, `renderItem`, `ordered` (M8-08)
- [ ] `ordered === false` → renders items in original array order (M8-09)
- [ ] `ordered === true` → sorts by `getScore(item)` descending; items without score placed last (M8-13)
- [ ] FLIP: snapshot captured via `prevPositionsRef` before render; delta applied and removed via `requestAnimationFrame`; no `flushSync` (ADR-017, M8-11)
- [ ] `ordered` toggle → items animate; no re-mount (M8-11, M8-12)
- [ ] Container uses `position: relative`; items use `transform` (M8-14)
- [ ] Each item renders with `data-testid="reorderable-item"` and `data-score` attribute (design requirement for Playwright)
- [ ] `aria-live="polite"` on container (design accessibility checklist)
- [ ] `motion-safe:transition-transform` (not bare `transition`) for reduced-motion support (ADR-017)
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: unit
**Gate**: quick

---

### T5: Create `<ClientSelectorDropdown>` [P]

**What**: Dropdown component that fetches client list from `GET /api/proxy/clients`, renders it in the Header navbar with badge de país, writes to `useSelectedClient`, handles loading/error inline.
**Where**: `frontend/src/components/layout/ClientSelectorDropdown.tsx` (new)
**Depends on**: T3
**Reuses**: `useSelectedClient` from T3; `apiFetch` from `lib/fetch-wrapper.ts`; Radix `@radix-ui/react-select` (already installed M5)

**Tools**:
- MCP: `filesystem` (read existing Header.tsx + fetch-wrapper.ts before writing)
- Skill: `coding-guidelines`, `react-best-practices` (`rerender-derived-state-no-effect` — derive loading/error during render, not in separate effect)

**Done when**:
- [ ] Placeholder "Selecionar cliente..." when `selectedClient === null` (M8-16)
- [ ] Fetches clients via `GET /api/proxy/clients` in `useEffect`; shows spinner during load (M8-21)
- [ ] On select: calls `setSelectedClient(client)` (M8-17)
- [ ] Selected state shows client name + country emoji badge (M8-18): 🇧🇷 BR, 🇲🇽 MX, 🇨🇴 CO, 🇳🇱 NL, 🇷🇴 RO
- [ ] Error state shows "Clientes indisponíveis" inline without breaking Header (M8-22)
- [ ] `aria-label="Selecionar cliente"`, `role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"` (design accessibility)
- [ ] Mobile: client name hidden on `< sm`, emoji always visible (`hidden sm:inline` pattern from design)
- [ ] Touch targets ≥ 44×44px
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: unit
**Gate**: quick

---

### T6: Create `<RAGDrawer>` always-mounted Sheet [P]

**What**: Wrap existing `RAGChatPanel` in a Radix `Sheet` that is always rendered in the DOM (ADR-018); `isOpen` controlled via prop from Header; `chatHistory` stays in `demoSlice.chatHistory`; focus trap and Escape delegated to Radix.
**Where**: `frontend/src/components/chat/RAGDrawer.tsx` (new)
**Depends on**: T3
**Reuses**: `RAGChatPanel` from M5 (zero changes); shadcn `Sheet` (from `@radix-ui/react-dialog` already installed); `useSelectedClient` from T3

**Tools**:
- MCP: `filesystem` (read existing RAGChatPanel.tsx + ADR-018 before writing), `context7` (verify shadcn Sheet API for always-mounted pattern)
- Skill: `coding-guidelines`, `react-best-practices` (`rendering-activity` — always-mounted visibility pattern)

**Done when**:
- [ ] Component rendered unconditionally (always-mounted, ADR-018); `open` prop controls Sheet visibility (M8-41)
- [ ] Sheet slides from right; `w-[420px]` on desktop, `w-full` on mobile (M8-38)
- [ ] Overlay semi-transparent; main content visible behind (M8-39)
- [ ] Escape and click-outside close Sheet — delegated to Radix, `onOpenAutoFocus` NOT suppressed (M8-40, design committee finding)
- [ ] Header shows "Chat RAG — [nome cliente]" when `selectedClient !== null` (M8-43); "Chat RAG" otherwise (M8-44)
- [ ] `RAGChatPanel` rendered as-is without modification (M8-42)
- [ ] `role="dialog"`, `aria-modal="true"`, `aria-label="Chat RAG"` delegated to Radix Sheet (design)
- [ ] `tailwindcss-animate` keyframes power slide-in animation (T1 dependency)
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: unit
**Gate**: quick

---

### T7: Add `ScoreBadge` component and extend `ProductCard` with optional `scoreBadge` prop

**What**: Create `ScoreBadge` with semantic colors (≥70% green / 40–69% yellow / <40% gray) and breakdown tooltip; extend `ProductCard` with `scoreBadge?: ScoreBadgeProps` optional prop — zero breaking changes.
**Where**:
- `frontend/src/components/catalog/ScoreBadge.tsx` (new)
- `frontend/src/components/catalog/ProductCard.tsx` (modify — add optional prop)
**Depends on**: T3
**Reuses**: `ScoreTooltip` logic from M5 for score formatting; Radix `@radix-ui/react-tooltip` (already installed)

**Tools**:
- MCP: `filesystem` (read existing ProductCard.tsx + ScoreTooltip before writing)
- Skill: `coding-guidelines`

**Done when**:
- [ ] `ScoreBadge` accepts `{ finalScore: number; neuralScore: number; semanticScore: number }` and renders "XX% match" (M8-33)
- [ ] Tooltip shows `Neural: X.XX` and `Semântico: X.XX` on hover (M8-34)
- [ ] Color variants: `≥ 0.70` → green, `0.40–0.69` → yellow, `< 0.40` → gray (design)
- [ ] `no-score` state: badge visible only via `group-hover` (M8-35)
- [ ] `aria-label="Score: XX% match"`, `aria-describedby` pointing to breakdown (design accessibility)
- [ ] `ProductCard` accepts `scoreBadge?: ScoreBadgeProps`; renders `<ScoreBadge>` when present and `ordered === true`; hides when `ordered === false` (M8-36)
- [ ] Existing `ProductCard` render tests still pass (no regression)
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: unit
**Gate**: quick

---

### T8: Add "✨ Ordenar por IA" toolbar to `CatalogPanel` + wire `<ReorderableGrid>`

**What**: Replace the current product grid in `CatalogPanel` with `<ReorderableGrid>`; add toolbar button "✨ Ordenar por IA" / "✕ Ordenação original"; wire `useRecommendationFetcher`, `useCatalogOrdering`, `useSelectedClient`; pass `scoreBadge` props to `renderItem`.
**Where**: `frontend/src/components/catalog/CatalogPanel.tsx` (modify)
**Depends on**: T4 (`ReorderableGrid`), T7 (`ScoreBadge` + extended `ProductCard`), T3 (hooks)
**Reuses**: Existing filter logic in `CatalogPanel`; `useCatalogOrdering`, `useRecommendationFetcher`, `useSelectedClient` from T3

**Tools**:
- MCP: `filesystem` (read CatalogPanel.tsx before modifying)
- Skill: `coding-guidelines`, `react-best-practices` (`rerender-memo` — memoize `renderItem` callback to prevent ReorderableGrid re-renders on unrelated state changes)

**Done when**:
- [ ] Toolbar renders "✨ Ordenar por IA" button when `selectedClient !== null` (M8-23)
- [ ] Button disabled with tooltip "Selecione um cliente na navbar" when `selectedClient === null`; uses `<span>` wrapper for tooltip (M8-24, design committee finding)
- [ ] Clicking button with no cache calls `useRecommendationFetcher.fetch(clientId)`; shows loading spinner in button (M8-25)
- [ ] Clicking button with cache (`cachedForClientId === selectedClient.id`) reuses cache — no new fetch (M8-26)
- [ ] After fetch resolves: `setOrdered(true)` → `<ReorderableGrid ordered={true}>` animates (M8-27)
- [ ] Button shows "✕ Ordenação original" when `ordered === true` (M8-28)
- [ ] Clicking "✕ Ordenação original" → `reset()` → `ordered = false` → animation reversal (M8-29)
- [ ] Failed fetch → `setOrdered(false)`, toast error (M8-31); toast wired in T13
- [ ] Active filters respected: `<ReorderableGrid>` receives filtered product array, not full catalog (M8-32)
- [ ] Score badges shown in `renderItem` when `ordered === true`, hidden otherwise (M8-33..36)
- [ ] `aria-disabled` (not native `disabled`) + `aria-pressed` on sort button (design accessibility)
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: unit
**Gate**: quick

---

### T9: Update `Header` — add `ClientSelectorDropdown`, RAG button, `RAGDrawer` (always-mounted)

**What**: Wire `<ClientSelectorDropdown>` and "💬 Chat RAG" button into `Header`; add `<RAGDrawer>` (always-mounted); manage `isOpen` local state for the Sheet.
**Where**: `frontend/src/components/layout/Header.tsx` (modify)
**Depends on**: T5 (`ClientSelectorDropdown`), T6 (`RAGDrawer`)
**Reuses**: Existing Header structure; `isOpen` as local `useState<boolean>(false)`

**Tools**:
- MCP: `filesystem` (read Header.tsx before modifying)
- Skill: `coding-guidelines`

**Done when**:
- [ ] `<ClientSelectorDropdown>` rendered to the right of existing status badges (M8-15)
- [ ] "💬 Chat RAG" button (icon + label) rendered in the right side of navbar before status badges (M8-37)
- [ ] Clicking "💬 Chat RAG" → `setIsOpen(true)` (M8-38)
- [ ] `<RAGDrawer open={isOpen} onClose={() => setIsOpen(false)} />` rendered unconditionally (ADR-018)
- [ ] `RAGDrawer` receives `selectedClient` from `useSelectedClient()` (M8-43)
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: unit
**Gate**: quick

---

### T10: Remove legacy Providers from `layout.tsx` + migrate existing consumers to domain hooks

**What**: Remove `<ClientProvider>` and `<RecommendationProvider>` wrappers from `layout.tsx`; update `useClient()` and `useRecommendations()` call sites to use domain hooks from T3 — maintaining identical external interfaces (M8-06, M8-07).
**Where**:
- `frontend/src/app/layout.tsx` (modify)
- Any component that imports from `context/ClientContext` or `context/RecommendationContext` (modify)
**Depends on**: T9 (Header already uses new hooks; ensures nothing breaks when Providers are removed)
**Reuses**: Domain hooks from T3

**Tools**:
- MCP: `filesystem` (read layout.tsx + all Context consumers before migrating)
- Skill: `coding-guidelines` (surgical changes — touch only the import/usage lines, not adjacent code)

**Done when**:
- [ ] `layout.tsx` has no `<ClientProvider>` or `<RecommendationProvider>` imports (M8-07)
- [ ] All `useClient()` call sites use `useSelectedClient()` from T3 with same interface (M8-06)
- [ ] All `useRecommendations()` call sites use domain hook from T3 (M8-06)
- [ ] `npm run build --prefix frontend` exits 0 — no broken imports (M8-06)
- [ ] `npm run lint --prefix frontend` exits 0
- [ ] Gate check passes: `npm run build --prefix frontend && npm run lint --prefix frontend`

**Tests**: none
**Gate**: build

**Commit**: `feat(frontend): migrate state to Zustand, wire Header — M8 Sprint 0 + core components`

---

### T11: Migrate `ClientPanel` to read-only mode [P]

**What**: Remove `ClientSelector` dropdown and `RecommendButton` from `ClientPanel`; show `ClientProfileCard` when client is selected, empty state when not.
**Where**: `frontend/src/components/client/ClientPanel.tsx` (modify)
**Depends on**: T10 (Providers removed; hooks available)
**Reuses**: `useSelectedClient()` from T3; existing `ClientProfileCard`

**Tools**:
- MCP: `filesystem` (read ClientPanel.tsx before modifying)
- Skill: `coding-guidelines` (surgical — remove only dropdown + button, preserve ProfileCard)

**Done when**:
- [ ] `ClientPanel` reads `selectedClient` from `useSelectedClient()` — no dropdown (M8-47)
- [ ] When `selectedClient !== null`: renders `ClientProfileCard` with segment, country, orders (M8-45)
- [ ] When `selectedClient === null`: renders empty state "Selecione um cliente na navbar para ver o perfil" (M8-46)
- [ ] `RecommendButton` removed from `ClientPanel` (M8-48)
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: unit
**Gate**: quick

---

### T12: Update `RecommendationPanel` — read from store + add banner [P]

**What**: Replace Context read with `useRecommendations()` hook; add banner "Use '✨ Ordenar por IA' no Catálogo..." when no recommendations loaded; preserve existing comparison UI.
**Where**: `frontend/src/components/recommendations/RecommendationPanel.tsx` (modify)
**Depends on**: T10 (Providers removed; hooks available)
**Reuses**: `useRecommendations()` from T3; existing comparison layout from M5

**Tools**:
- MCP: `filesystem` (read RecommendationPanel.tsx before modifying)
- Skill: `coding-guidelines` (surgical — add banner above existing UI; preserve comparison layout)

**Done when**:
- [ ] `RecommendationPanel` reads recommendations from `useRecommendations()`, not Context (M8-51)
- [ ] When no recommendations (`recommendations.length === 0`): banner with instruction text + fallback "Obter Recomendações" button (M8-49)
- [ ] When recommendations exist (from catalog or direct button): comparison panel renders as-is (M8-50)
- [ ] Recommendations loaded via "Ordenar por IA" in catalog appear in this panel without re-fetch (M8-51 — shared store)
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: unit
**Gate**: quick

---

### T13: Add toast notifications via `sonner`

**What**: Install `sonner` (or use existing toast if present); wire success/error toasts for recommendation fetch and LLM timeout in `useRecommendationFetcher` and `RAGDrawer`.
**Where**:
- `frontend/package.json` (add `sonner` if not present)
- `frontend/src/app/layout.tsx` (add `<Toaster>` provider)
- `frontend/src/lib/hooks/useRecommendationFetcher.ts` (modify — add success/error toasts)
- `frontend/src/components/chat/RAGDrawer.tsx` (modify — add LLM timeout toast)
**Depends on**: T11, T12 (all components wired; only toast layer remaining)
**Reuses**: `useRecommendationFetcher` from T3; `RAGDrawer` from T6

**Tools**:
- MCP: `filesystem` (read package.json to check if sonner already present), `context7` (verify sonner API: `toast.success`, `toast.error`, `<Toaster>` placement)
- Skill: `coding-guidelines`

**Done when**:
- [ ] `sonner` installed (or existing toast library used); `<Toaster>` mounted in layout (M8-55 — bottom-right, stacked)
- [ ] Success toast: "✓ Recomendações carregadas para [nome cliente]" (green, 3s) on fetch success (M8-52)
- [ ] Error toast: "Erro ao carregar recomendações — tente novamente" (red) on fetch failure (M8-53)
- [ ] LLM timeout toast: "Aguardando resposta do LLM..." after 10s in `RAGDrawer` (M8-54)
- [ ] Toasts animate in/out at bottom-right (M8-55)
- [ ] Gate check passes: `npm run lint --prefix frontend`

**Tests**: none
**Gate**: quick

---

### T14: E2E Playwright test — M8 happy-path journey

**What**: Add Playwright E2E test covering: select client in navbar → navigate to catalog → click "✨ Ordenar por IA" → assert animation completes + score badges visible → click "✕ Ordenação original" → open RAG drawer → send message → assert response.
**Where**: `frontend/e2e/m8-ux-journey.spec.ts` (new)
**Depends on**: T13 (all features wired and tested)
**Reuses**: Existing Playwright config (`frontend/e2e/playwright.config.ts`); existing helpers/fixtures from M7 E2E suite

**Tools**:
- MCP: `filesystem` (read existing M7 E2E spec files for helper patterns)
- Skill: `coding-guidelines`

**Done when**:
- [ ] Test: select "Miguel Santos (BR)" in navbar → badge 🇧🇷 visible → navigate to catalog → "✨ Ordenar por IA" button enabled
- [ ] Test: click "✨ Ordenar por IA" → `data-testid="reorderable-item"` count ≥ 1; first item has `data-score` attribute
- [ ] Test: score badge "% match" visible on first card
- [ ] Test: click "✕ Ordenação original" → catalog returns to original order
- [ ] Test: click "💬 Chat RAG" → drawer opens → type message → response bubble appears
- [ ] Test: navigate to "Recomendações" tab → same recommendations visible (shared store)
- [ ] Build gate passes: `npm run build --prefix frontend && npm run lint --prefix frontend && npx playwright test --config frontend/e2e/playwright.config.ts`

**Tests**: e2e
**Gate**: build

**Commit**: `feat(frontend): M8 UX Journey Refactor — Zustand store, ReorderableGrid, ClientSelectorDropdown, RAGDrawer, ScoreBadge, toast`

---

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1 ──→ T2 ──→ T3

Phase 2 (Parallel after T3):
  T3 complete, then:
    ├── T4 [P]   ← ReorderableGrid
    ├── T5 [P]   ← ClientSelectorDropdown
    └── T6 [P]   ← RAGDrawer

Phase 3 (Sequential after T4 + T5):
  T4, T5, T3 complete:
    T7 ──→ T8

Phase 4 (Sequential after T5 + T6 + T7):
  T5, T6, T7 complete:
    T9 ──→ T10

Phase 5 (Parallel after T10):
  T10 complete, then:
    ├── T11 [P]   ← ClientPanel migration
    └── T12 [P]   ← RecommendationPanel migration

Phase 6 (Sequential after T11 + T12):
  T11, T12 complete:
    T13 ──→ T14
```

---

## Task Granularity Check

| Task | Scope | Status |
|------|-------|--------|
| T1: Install zustand + tailwindcss-animate | 2 config files | ✅ Granular |
| T2: Zustand store (3 slices + index) | 4 related files, 1 concept | ✅ Granular |
| T3: Domain hooks (4 hooks) | 4 related files, 1 concept | ✅ Granular |
| T4: ReorderableGrid | 1 component | ✅ Granular |
| T5: ClientSelectorDropdown | 1 component | ✅ Granular |
| T6: RAGDrawer | 1 component | ✅ Granular |
| T7: ScoreBadge + ProductCard extension | 1 new + 1 small change, cohesive | ✅ Granular |
| T8: CatalogPanel toolbar + wire | 1 component modification | ✅ Granular |
| T9: Header wiring | 1 component modification | ✅ Granular |
| T10: Remove Providers + migrate consumers | layout migration, 1 concept | ✅ Granular |
| T11: ClientPanel read-only | 1 component modification | ✅ Granular |
| T12: RecommendationPanel + banner | 1 component modification | ✅ Granular |
| T13: Toast notifications | 1 cross-cutting concern | ✅ Granular |
| T14: E2E Playwright test | 1 test file | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|------|------------------------|---------------|--------|
| T1 | None | None | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 [P] | ✅ Match |
| T5 | T3 | T3 → T5 [P] | ✅ Match |
| T6 | T3 | T3 → T6 [P] | ✅ Match |
| T7 | T3 | T4, T5, T3 → T7 | ✅ Match |
| T8 | T4, T7, T3 | T7 → T8 | ✅ Match |
| T9 | T5, T6 | T5, T6, T7 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 [P] | ✅ Match |
| T12 | T10 | T10 → T12 [P] | ✅ Match |
| T13 | T11, T12 | T11, T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |

---

## Test Co-location Validation

> No TESTING.md exists — conventions derived from M7 tasks.md: frontend components use `unit` gate with `npm run lint`; E2E flows use `e2e` gate with Playwright; build/migration tasks use `build` gate; pure config/wiring tasks use `none`.

| Task | Code Layer Created/Modified | Convention Requires | Task Says | Status |
|------|-----------------------------|---------------------|-----------|--------|
| T1 | Config only | none | none | ✅ OK |
| T2 | Zustand store (state logic) | unit | unit | ✅ OK |
| T3 | Domain hooks (state + async logic) | unit | unit | ✅ OK |
| T4 | UI component (animation logic) | unit | unit | ✅ OK |
| T5 | UI component (async fetch) | unit | unit | ✅ OK |
| T6 | UI component (Sheet wrapper) | unit | unit | ✅ OK |
| T7 | UI component + extension | unit | unit | ✅ OK |
| T8 | UI component (orchestration) | unit | unit | ✅ OK |
| T9 | Layout wiring | unit | unit | ✅ OK |
| T10 | Migration (no new logic) | none (build verification) | none/build | ✅ OK |
| T11 | UI component modification | unit | unit | ✅ OK |
| T12 | UI component modification | unit | unit | ✅ OK |
| T13 | Cross-cutting toast wiring | none (integration of existing parts) | none | ✅ OK |
| T14 | E2E test file | e2e | e2e | ✅ OK |

---

## Requirement Coverage

| Requirement IDs | Covered by |
|----------------|------------|
| M8-01 | T1 (zustand install) |
| M8-02 | T2 (clientSlice persist) |
| M8-03 | T2 (demoSlice no persist) |
| M8-04 | T2 (clearDemo on setSelectedClient) |
| M8-05 | T2 (useAppStore) |
| M8-06 | T10 (migrate consumers) |
| M8-07 | T10 (remove Providers from layout) |
| M8-08..M8-14 | T4 (ReorderableGrid) |
| M8-15..M8-22 | T5 (ClientSelectorDropdown) + T9 (Header wiring) |
| M8-23..M8-32 | T8 (CatalogPanel toolbar) + T3 (useRecommendationFetcher) |
| M8-33..M8-36 | T7 (ScoreBadge + ProductCard) + T8 (renderItem wiring) |
| M8-37..M8-44 | T6 (RAGDrawer) + T9 (Header RAG button) |
| M8-45..M8-48 | T11 (ClientPanel read-only) |
| M8-49..M8-51 | T12 (RecommendationPanel banner + shared store) |
| M8-52..M8-55 | T13 (toast notifications) |

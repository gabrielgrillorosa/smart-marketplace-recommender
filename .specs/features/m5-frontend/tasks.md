# M5 Frontend — Tasks

**Feature:** M5 — Frontend (Next.js demo UI)
**Spec:** `.specs/features/m5-frontend/spec.md`
**Design:** `.specs/features/m5-frontend/design.md`
**Status:** In Progress

---

## Phase 1 — Foundation

### T01 — Install shadcn/ui and configure globals

**What:** Install shadcn/ui with `card badge tooltip dialog skeleton` components; update `globals.css` with CSS variable palette.
**Where:** `frontend/` (root), `frontend/app/globals.css`
**Depends on:** —
**Reuses:** Existing Tailwind config
**Done when:**
- `npx shadcn-ui@latest init` completes (slate style, CSS variables)
- `npx shadcn-ui@latest add card badge tooltip dialog skeleton` completes
- `components/ui/` directory created with generated files
- `globals.css` contains shadcn CSS variable definitions
**Tests:** none (config-only)
**Gate:** Build — `cd frontend && npm run build`

---

### T02 — Create `lib/types.ts`

**What:** Define all canonical DTOs as TypeScript interfaces: `Client`, `ProductSummary`, `Product`, `ProductDetail`, `SearchResult`, `RecommendationResult`, `RagChunk`, `RagResponse`, `Message`, `ServiceStatus`.
**Where:** `frontend/lib/types.ts`
**Depends on:** T01
**Reuses:** Data Models section in design.md
**Done when:**
- All interfaces from design.md `lib/types.ts` block are present with correct field types
- `tsc --noEmit` passes
**Tests:** none (types-only)
**Gate:** Build — `cd frontend && npm run build`

---

### T03 — Create `lib/fetch-wrapper.ts`

**What:** `apiFetch(url, options?, signal?)` — handles `AbortError`, JSON parse, typed error; timeout defaults (60s general, 90s for RAG passed via options).
**Where:** `frontend/lib/fetch-wrapper.ts`
**Depends on:** T02
**Reuses:** —
**Done when:**
- Function exported as `apiFetch`
- Throws on non-ok HTTP response with message from body if possible
- Handles `AbortError` by rethrowing (caller manages)
- Accepts optional `signal` from `AbortController`
**Tests:** none (integration-style; E2E tests deferred to M6)
**Gate:** Build — `cd frontend && npm run build`

---

### T04 — Create `lib/utils/shuffle.ts`

**What:** `seededShuffle<T>(arr: T[], seed: string): T[]` — LCG algorithm (ADR-004) for stable, deterministic shuffle by client ID.
**Where:** `frontend/lib/utils/shuffle.ts`
**Depends on:** T02
**Reuses:** ADR-004 in design.md (LCG: hash seed string → numeric seed → Fisher-Yates with LCG)
**Done when:**
- `seededShuffle(arr, "same-seed")` returns same order on every call
- `seededShuffle(arr, "seed-A") !== seededShuffle(arr, "seed-B")` (different seeds produce different orders)
- Returns new array (does not mutate input)
**Tests:** none (unit test in M6 test suite)
**Gate:** Build — `cd frontend && npm run build`

---

### T05 — Create `lib/adapters/` (search, recommend, rag)

**What:** Three adapter functions: `adaptSearchResults`, `adaptRecommendations` (extracts `isFallback`), `adaptRagResponse` — each transforms upstream JSON → canonical DTO.
**Where:** `frontend/lib/adapters/search.ts`, `frontend/lib/adapters/recommend.ts`, `frontend/lib/adapters/rag.ts`
**Depends on:** T02
**Reuses:** API response shapes from spec.md
**Done when:**
- `adaptSearchResults(raw)` returns `SearchResult[]`
- `adaptRecommendations(raw)` returns `{ results: RecommendationResult[], isFallback: boolean }`
- `adaptRagResponse(raw)` returns `RagResponse`
- All functions handle missing/undefined fields gracefully (defaults to empty/null)
**Tests:** none (tested via integration in M6)
**Gate:** Build — `cd frontend && npm run build`

---

### T06 — Create Context Providers

**What:** `ClientContext` with `ClientProvider` + `useClient`; `RecommendationContext` with `RecommendationProvider` + `useRecommendations`. State shapes exactly as in design.md.
**Where:** `frontend/lib/contexts/ClientContext.tsx`, `frontend/lib/contexts/RecommendationContext.tsx`
**Depends on:** T02
**Reuses:** Context state shapes from design.md
**Done when:**
- `useClient()` returns `{ selectedClient, setSelectedClient }` — throws if used outside provider
- `useRecommendations()` returns `{ recommendations, loading, isFallback, setRecommendations, setLoading, clearRecommendations }` — throws if used outside provider
- Initial state: `selectedClient: null`, `recommendations: []`, `loading: false`, `isFallback: false`
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T07 — Create `lib/hooks/useServiceHealth.ts`

**What:** Hook that polls `/actuator/health` (API Service) and `/ready` (AI Service) every 30s; cleans up interval on unmount; returns `{ apiStatus, aiStatus }` typed as `ServiceStatus`.
**Where:** `frontend/lib/hooks/useServiceHealth.ts`
**Depends on:** T02, T03
**Reuses:** URLs from env vars `NEXT_PUBLIC_API_SERVICE_URL` / `NEXT_PUBLIC_AI_SERVICE_URL`
**Done when:**
- Returns `'up'` when endpoint responds 200, `'down'` on error/timeout, `'unknown'` before first check
- `clearInterval` cleanup in `useEffect` return
- Poll interval: 30000ms
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

## Phase 2 — API Routes (Server-Side Proxy)

### T08 — Create `app/api/proxy/search/route.ts`

**What:** POST route that forwards body to AI Service `/api/v1/search/semantic`, calls `adaptSearchResults`, returns `SearchResult[]` as JSON.
**Where:** `frontend/app/api/proxy/search/route.ts`
**Depends on:** T03, T05
**Reuses:** `apiFetch` from `lib/fetch-wrapper.ts`; `adaptSearchResults` from `lib/adapters/search.ts`
**Done when:**
- Reads `AI_SERVICE_URL` env var (default `http://localhost:3000`)
- Returns `NextResponse.json(adaptSearchResults(data))`
- Returns `NextResponse.json({ error })` with status 502 on upstream failure
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T09 — Create `app/api/proxy/rag/route.ts`

**What:** POST route that forwards body to AI Service `/api/v1/rag/query`, calls `adaptRagResponse`, returns `RagResponse` as JSON. Timeout: 90s.
**Where:** `frontend/app/api/proxy/rag/route.ts`
**Depends on:** T03, T05
**Reuses:** `apiFetch`; `adaptRagResponse`
**Done when:**
- Reads `AI_SERVICE_URL` env var
- Passes `AbortSignal.timeout(90000)` to fetch
- Returns `NextResponse.json(adaptRagResponse(data))`
- Returns error JSON with status 502 on failure
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T10 — Create `app/api/proxy/recommend/route.ts`

**What:** POST route that forwards `{ clientId, limit }` to API Service `/api/v1/recommend`, calls `adaptRecommendations`, returns `{ results, isFallback }` as JSON.
**Where:** `frontend/app/api/proxy/recommend/route.ts`
**Depends on:** T03, T05
**Reuses:** `apiFetch`; `adaptRecommendations`
**Done when:**
- Reads `API_SERVICE_URL` env var (default `http://localhost:8080`)
- Returns `NextResponse.json({ results, isFallback })`
- Returns error JSON with status 502 on failure
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

## Phase 3 — Layout

### T11 — Update `app/layout.tsx` — wrap with providers + shadcn globals

**What:** Add `ClientProvider` + `RecommendationProvider` wrapping `{children}`; import shadcn globals CSS.
**Where:** `frontend/app/layout.tsx`
**Depends on:** T01, T06
**Reuses:** Existing layout skeleton
**Done when:**
- `<ClientProvider><RecommendationProvider>{children}</RecommendationProvider></ClientProvider>` wraps children
- shadcn global CSS imported
- `tsc --noEmit` clean
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T12 — Create `components/layout/ServiceStatusBadge.tsx`

**What:** Green/red/grey badge component receiving `status: ServiceStatus` and `label: string`.
**Where:** `frontend/components/layout/ServiceStatusBadge.tsx`
**Depends on:** T02
**Reuses:** shadcn `Badge`
**Done when:**
- `status='up'` → green badge with ✓
- `status='down'` → red badge with ✗
- `status='unknown'` → grey badge with "..."
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T13 — Create `components/layout/Header.tsx`

**What:** Header with logo, project name "Smart Marketplace Recommender", and two `ServiceStatusBadge` components (API Service + AI Service) using `useServiceHealth`.
**Where:** `frontend/components/layout/Header.tsx`
**Depends on:** T07, T12
**Reuses:** `useServiceHealth`, `ServiceStatusBadge`
**Done when:**
- Renders both service status badges
- Project name and logo placeholder visible
- No memory leaks (hook handles cleanup)
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T14 — Create `components/layout/TabNav.tsx`

**What:** 4-tab nav bar with tabs: "Catálogo", "Cliente", "Recomendações", "Chat RAG". Receives `activeTab` and `onTabChange`.
**Where:** `frontend/components/layout/TabNav.tsx`
**Depends on:** —
**Reuses:** Tailwind CSS
**Done when:**
- Active tab visually highlighted
- `onTabChange(tab)` fires on click
- Tab labels match design exactly
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T15 — Update `app/page.tsx` — tab state + panel mounting

**What:** Root page owns `activeTab` state; renders `Header`, `TabNav`, and conditionally mounts the active panel component (placeholders for panels not yet implemented).
**Where:** `frontend/app/page.tsx`
**Depends on:** T11, T13, T14
**Reuses:** —
**Done when:**
- `activeTab` state cycles through 4 panels
- Header and TabNav render
- Panel area shows placeholder text for not-yet-implemented panels
- `tsc --noEmit` clean
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

## Phase 4 — Catalog Panel

### T16 — Create `components/catalog/CategoryIcon.tsx`

**What:** Renders emoji per category: `beverages→🥤`, `food→🍎`, `personal_care→🧴`, `cleaning→🧹`, `snacks→🍿`. Fallback: `📦`.
**Where:** `frontend/components/catalog/CategoryIcon.tsx`
**Depends on:** —
**Done when:** All 5 categories map to correct emoji; unknown category returns `📦`
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T17 — Create `components/catalog/ProductCard.tsx`

**What:** Card with `CategoryIcon`, name, category badge, supplier badge, country badges (flag emoji), price. Optional `similarityScore` renders `XX% match` badge.
**Where:** `frontend/components/catalog/ProductCard.tsx`
**Depends on:** T02, T16
**Reuses:** shadcn `Card`, `CardContent`, `Badge`
**Done when:**
- All M5-01 fields visible
- `similarityScore` badge shown only when prop present (M5-06)
- Country codes mapped to flag emoji (🇧🇷 BR, 🇲🇽 MX, 🇨🇴 CO, 🇳🇱 NL, 🇷🇴 RO)
- Click handler prop `onClick?: () => void`
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T18 — Create `components/catalog/ProductDetailModal.tsx`

**What:** shadcn `Dialog` with full product details: name, description, category, supplier, countries, price, SKU. Closes when `product` prop is null.
**Where:** `frontend/components/catalog/ProductDetailModal.tsx`
**Depends on:** T02, T17
**Reuses:** shadcn `Dialog`, `DialogContent`
**Done when:**
- M5-07 fields all visible in modal
- `open={product !== null}`
- `onClose` prop called on dismiss
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T19 — Create `components/catalog/ProductFilters.tsx`

**What:** Three dropdowns (category, country, supplier); all populated dynamically from products list; emits `{ category, country, supplier }` filter state upward.
**Where:** `frontend/components/catalog/ProductFilters.tsx`
**Depends on:** T02
**Reuses:** Tailwind `<select>` (native; shadcn Select is for ClientSelector)
**Done when:**
- Dropdowns show "All" option + unique values from product list
- Emits filter state change on selection
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T20 — Create `components/catalog/SemanticSearchBar.tsx`

**What:** Input + submit button; validates non-empty; calls `POST /api/proxy/search`; uses `AbortController` to cancel previous in-flight request; emits results array upward; shows inline error on failure; shows empty message (M5-08) when results empty.
**Where:** `frontend/components/catalog/SemanticSearchBar.tsx`
**Depends on:** T02, T03
**Reuses:** `apiFetch`
**Done when:**
- M5-05, M5-08, M5-09 criteria met
- Empty submit is a no-op (M5 edge case)
- `AbortController` cancels previous request on new submit
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T21 — Create `components/catalog/ProductGrid.tsx`

**What:** Renders array of `ProductCard[]`; receives filtered/searched products.
**Where:** `frontend/components/catalog/ProductGrid.tsx`
**Depends on:** T17
**Done when:** Renders product cards in responsive grid (3+ columns on desktop)
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T22 — Create `components/catalog/CatalogPanel.tsx`

**What:** Fetches all products on mount (`GET /api/v1/products?size=100` from API Service direct — NOT via proxy); owns filter state + search state; computes `filteredProducts`; renders `ProductFilters`, `SemanticSearchBar`, `ProductGrid`, `ProductDetailModal`. Search and filters are mutually exclusive: clearing search restores filter state.
**Where:** `frontend/components/catalog/CatalogPanel.tsx`
**Depends on:** T03, T17, T18, T19, T20, T21
**Reuses:** `apiFetch`; `NEXT_PUBLIC_API_SERVICE_URL`
**Done when:**
- M5-01 through M5-09 all met
- Filter combinations work correctly (M5-02, M5-03, M5-04)
- Search replaces filtered view; back to filters on clear
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

## Phase 5 — Client Profile Panel

### T23 — Create `components/client/ClientSelector.tsx`

**What:** shadcn `Select` dropdown; displays `name (country)` for each client; emits selected `Client` object.
**Where:** `frontend/components/client/ClientSelector.tsx`
**Depends on:** T02
**Reuses:** shadcn `Select` (not yet added — add `select` to shadcn install during this task if missing)
**Done when:**
- Displays all clients in dropdown
- Emits full `Client` object on selection (M5-10)
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T24 — Create `components/client/ClientProfileCard.tsx`

**What:** Displays client: segment, country (with flag emoji), total orders, last 5 purchased products. Shows "Sem pedidos registrados" when `recentProducts` is empty.
**Where:** `frontend/components/client/ClientProfileCard.tsx`
**Depends on:** T02
**Reuses:** shadcn `Card`, `CardContent`
**Done when:**
- M5-11 criteria met
- Empty purchase history edge case handled
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T25 — Create `components/client/RecommendButton.tsx`

**What:** "Obter Recomendações" button; calls `POST /api/proxy/recommend` with `{ clientId, limit: 10 }`; sets `RecommendationContext.loading = true` before call; calls `setRecommendations(results, isFallback)` on success; shows loading state on button during fetch.
**Where:** `frontend/components/client/RecommendButton.tsx`
**Depends on:** T06, T03
**Reuses:** `useRecommendations` context; `apiFetch`
**Done when:**
- M5-12, M5-13 criteria met
- Loading state visible on button during fetch
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T26 — Create `components/client/ClientPanel.tsx`

**What:** Fetches all clients on mount from `GET /api/v1/clients?size=100`; renders `ClientSelector`, `ClientProfileCard`, `RecommendButton`. On client change: calls `clearRecommendations()` then `setSelectedClient(client)` (M5-15).
**Where:** `frontend/components/client/ClientPanel.tsx`
**Depends on:** T06, T23, T24, T25
**Reuses:** `useClient`, `useRecommendations`; `apiFetch`
**Done when:**
- M5-10 through M5-15 all met
- Switching clients clears recommendations before setting new client (M5-15)
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

## Phase 6 — Recommendation Panel

### T27 — Create `components/recommendations/RecommendationCard.tsx`

**What:** Product name, `finalScore` (2 decimal places), `matchReason` badge (`semantic`/`neural`/`hybrid`). Optional `showScore: boolean` prop — when false, hides score/badge (for "Sem IA" column).
**Where:** `frontend/components/recommendations/RecommendationCard.tsx`
**Depends on:** T02
**Reuses:** shadcn `Card`, `Badge`
**Done when:** M5-17 criteria met; `showScore=false` hides score/badge
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T28 — Create `components/recommendations/ScoreTooltip.tsx`

**What:** shadcn `Tooltip` wrapping the score area; content shows `neuralScore: X.XX` and `semanticScore: X.XX` (or `'N/A'` when absent).
**Where:** `frontend/components/recommendations/ScoreTooltip.tsx`
**Depends on:** T02
**Reuses:** shadcn `Tooltip`, `TooltipContent`, `TooltipTrigger`
**Done when:** M5-18 met; `neuralScore ?? 'N/A'` and `semanticScore ?? 'N/A'` rendered
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T29 — Create `components/recommendations/RecommendationSkeleton.tsx`

**What:** 10 skeleton cards rendered during loading state (M5-19).
**Where:** `frontend/components/recommendations/RecommendationSkeleton.tsx`
**Depends on:** —
**Reuses:** shadcn `Skeleton`
**Done when:** 10 skeleton items render; shape matches `RecommendationCard` layout
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T30 — Create `components/recommendations/EmptyState.tsx`

**What:** Instruction text: "Selecione um cliente para ver recomendações" (M5-20).
**Where:** `frontend/components/recommendations/EmptyState.tsx`
**Depends on:** —
**Done when:** Renders when `recommendations.length === 0 && !loading`; correct instruction text
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T31 — Create `components/recommendations/FallbackBanner.tsx`

**What:** "Fallback — Top Sellers" banner shown when `isFallback === true` (M5-14).
**Where:** `frontend/components/recommendations/FallbackBanner.tsx`
**Depends on:** —
**Done when:** Renders with correct text; yellow/amber background to make it visually distinct
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T32 — Create `components/recommendations/RecommendedColumn.tsx` and `ShuffledColumn.tsx`

**What:** `RecommendedColumn` — ranked order, `RecommendationCard` with scores, `ScoreTooltip`. `ShuffledColumn` — `seededShuffle(recs, clientId)` via `useMemo([recommendations, selectedClient?.id])`, `RecommendationCard` with `showScore=false`.
**Where:** `frontend/components/recommendations/RecommendedColumn.tsx`, `frontend/components/recommendations/ShuffledColumn.tsx`
**Depends on:** T04, T06, T27, T28
**Reuses:** `useClient`, `useRecommendations`; `seededShuffle`
**Done when:**
- M5-16 met: both columns display same 10 products in different orders
- Shuffle is stable (same client → same order across re-renders via useMemo)
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T33 — Create `components/recommendations/RecommendationPanel.tsx`

**What:** Reads `RecommendationContext`; renders: `EmptyState` when no recs and not loading; `RecommendationSkeleton` when loading; `FallbackBanner` + two columns side-by-side when recs present; warning when model untrained.
**Where:** `frontend/components/recommendations/RecommendationPanel.tsx`
**Depends on:** T06, T29, T30, T31, T32
**Reuses:** `useRecommendations`
**Done when:** M5-16 through M5-20 all met; untrained model warning message shown when appropriate
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

## Phase 7 — RAG Chat Panel

### T34 — Create `components/chat/ChatMessage.tsx`

**What:** User bubble (right-aligned) or AI bubble (left-aligned) with timestamp. Error state: red tinted bubble. Accepts `Message` type.
**Where:** `frontend/components/chat/ChatMessage.tsx`
**Depends on:** T02
**Done when:** M5-22 met; error messages styled distinctly
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T35 — Create `components/chat/ContextChunks.tsx`

**What:** Collapsible `<details>` element showing retrieved chunks: product name + similarity score. Renders only for assistant messages with non-empty `chunks`.
**Where:** `frontend/components/chat/ContextChunks.tsx`
**Depends on:** T02
**Done when:** M5-23 met; collapsed by default; shows product name + score per chunk
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T36 — Create `components/chat/ExamplePrompts.tsx`

**What:** 3 clickable prompt chips: "Quais produtos sem açúcar estão disponíveis no México?", "Show me cleaning products from Unilever available in Netherlands", "Quais bebidas estão disponíveis no Brasil?". On click: calls `onSelect(prompt)`.
**Where:** `frontend/components/chat/ExamplePrompts.tsx`
**Depends on:** —
**Done when:** M5-24, M5-25 met; 3 prompts visible; `onSelect` called with correct string on click
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T37 — Create `components/chat/ChatInput.tsx`

**What:** Textarea + send button; submits on Enter (not Shift+Enter); uses `AbortController` to cancel previous request; emits `onSubmit(query)`.
**Where:** `frontend/components/chat/ChatInput.tsx`
**Depends on:** —
**Done when:** Enter submits; Shift+Enter adds newline; empty submit blocked; disabled state when `loading`
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T38 — Create `components/chat/RAGChatPanel.tsx`

**What:** Owns `messages: Message[]` state; renders `ExamplePrompts` (above input), `ChatMessage` list, `ContextChunks` per message, `ChatInput`. On submit: add user message → set loading → call `POST /api/proxy/rag` → add assistant message (with chunks) or error message. Auto-scroll via `messagesEndRef` in `useEffect([messages])`.
**Where:** `frontend/components/chat/RAGChatPanel.tsx`
**Depends on:** T03, T34, T35, T36, T37
**Reuses:** `apiFetch`
**Done when:** M5-21 through M5-27 all met
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

## Phase 8 — Integration & Wiring

### T39 — Wire all panels into `app/page.tsx`

**What:** Replace placeholder panel content with actual panel components: `CatalogPanel`, `ClientPanel`, `RecommendationPanel`, `RAGChatPanel`. State preservation verified: client selection and recommendations persist when switching tabs.
**Where:** `frontend/app/page.tsx`
**Depends on:** T15, T22, T26, T33, T38
**Done when:**
- All 4 panels mount correctly
- Tab switching preserves `ClientContext` and `RecommendationContext` state (M5-29)
- `tsc --noEmit` clean
**Tests:** none
**Gate:** Build — `cd frontend && npm run build`

---

### T40 — Final build gate + smoke test + update docs

**What:** Run full build; verify `tsc --noEmit` passes; verify `npm run lint` passes with zero warnings; update `ROADMAP.md` M5 status to `Execute ✓`; update `STATE.md` todos and current focus to M6.
**Where:** `frontend/` (build); `.specs/project/ROADMAP.md`; `.specs/project/STATE.md`
**Depends on:** T39
**Done when:**
- `npm run build` exits 0
- `npm run lint` exits 0 with zero warnings
- ROADMAP updated
- STATE updated
**Tests:** none
**Gate:** Build — `cd frontend && npm run build && npm run lint`

---

## Requirement Traceability

| Task | Requirements Covered |
|------|---------------------|
| T01 | shadcn foundation |
| T02 | All (types) |
| T03 | M5-05, M5-09, M5-21, M5-26 (fetch infra) |
| T04 | M5-16, M5-17, M5-18 (shuffle) |
| T05 | Adapter layer |
| T06 | M5-12, M5-13, M5-14, M5-15, M5-16, M5-29 (contexts) |
| T07 | M5-30 (health) |
| T08 | M5-05 (search proxy) |
| T09 | M5-21 (RAG proxy) |
| T10 | M5-12 (recommend proxy) |
| T11 | M5-28 (layout providers) |
| T12 | M5-30 (status badge) |
| T13 | M5-30 (header with health) |
| T14 | M5-28 (tab nav) |
| T15 | M5-28 (page skeleton) |
| T16 | M5-31 (category icons) |
| T17 | M5-01, M5-06, M5-31, M5-33 |
| T18 | M5-07 |
| T19 | M5-02, M5-03, M5-04 |
| T20 | M5-05, M5-08, M5-09 |
| T21 | M5-01 (grid) |
| T22 | M5-01–M5-09 |
| T23 | M5-10 |
| T24 | M5-11, edge case (no orders) |
| T25 | M5-12, M5-13 |
| T26 | M5-10–M5-15 |
| T27 | M5-17, M5-32 |
| T28 | M5-18 |
| T29 | M5-19, M5-32 |
| T30 | M5-20 |
| T31 | M5-14 |
| T32 | M5-16 |
| T33 | M5-16–M5-20, untrained model edge case |
| T34 | M5-22, M5-26 |
| T35 | M5-23 |
| T36 | M5-24, M5-25 |
| T37 | M5-21, edge case (empty submit) |
| T38 | M5-21–M5-27 |
| T39 | M5-28, M5-29 (full integration) |
| T40 | All (build gate) |

**Coverage:** 33/33 requirements mapped ✅

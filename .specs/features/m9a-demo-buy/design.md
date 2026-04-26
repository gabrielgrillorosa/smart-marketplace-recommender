# M9-A — Demo Buy + Live Reorder — Design

**Status**: Approved
**Date**: 2026-04-26
**Spec**: [spec.md](./spec.md)
**ADRs**: [ADR-021](./adr-021-unified-neo4j-write-read-transaction.md) · [ADR-022](./adr-022-delete-path-params.md)

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Frontend ["Frontend (Next.js)"]
        PC[ProductCard\n+ Demo Buy button\n+ Demo badge]
        CP[CatalogPanel\n+ Limpar Demo toolbar btn]
        RG[ReorderableGrid\n← já implementado M8]
        DS[demoSlice\n+ demoBuyLoading\n+ demoBoughtByClient]
        RS[recommendationSlice\n.setRecommendations()]
    end

    subgraph AIService ["AI Service (Fastify)"]
        DR[demoBuyRoutes.ts\nPOST /demo-buy\nDELETE /demo-buy/:cId/:pId\nDELETE /demo-buy/:cId]
        DBS[DemoBuyService\norchestrates write + profile + recommend]
        NR[Neo4jRepository\n+ createDemoBoughtAndGetEmbeddings()\n+ deleteDemoBought()\n+ clearAllDemoBought()]
        RS2[RecommendationService\n+ recommendFromVector(clientId, limit, profileVector)\nexisting recommend() unchanged]
        MP[meanPooling() — exported\ncosine() — exported]
    end

    subgraph Neo4j ["Neo4j"]
        E1["(:Client)-[:BOUGHT {is_demo:true}]->(:Product)"]
    end

    PC -- "click Demo Comprar" --> DS
    DS -- "POST /aiservice/api/v1/demo-buy" --> DR
    DR --> DBS
    DBS --> NR
    NR -- "MERGE + MATCH (same tx)" --> E1
    NR -- "embeddings[]" --> DBS
    DBS -- "meanPooling(embeddings)" --> MP
    DBS -- "recommendFromVector(clientId, limit, profileVector)" --> RS2
    RS2 -- "RecommendationResult[]" --> DBS
    DBS -- "200 { recommendations }" --> DR
    DR -- "response" --> DS
    DS -- "setRecommendations()" --> RS
    RS -- "new scores" --> RG
    RG -- "FLIP animation" --> CP

    PC -- "click Desfazer" --> DS
    DS -- "DELETE /demo-buy/:cId/:pId" --> DR
    DR --> DBS
    DBS --> NR
    NR -- "DELETE edge + getEmbeddings (same tx)" --> E1

    CP -- "click Limpar Demo" --> DS
    DS -- "DELETE /demo-buy/:cId" --> DR
    DR --> DBS
    DBS --> NR
    NR -- "DELETE all is_demo + getEmbeddings" --> E1
```

---

## Code Reuse Analysis

| Componente existente | Arquivo | Reutilização |
|----------------------|---------|--------------|
| `RecommendationService.recommend()` | `ai-service/src/services/RecommendationService.ts` | Não alterado — novo `recommendFromVector()` adicionado como método separado |
| `meanPooling()` | `ai-service/src/services/RecommendationService.ts` | Exportar como named export (atualmente local) |
| `cosine()` | `ai-service/src/services/RecommendationService.ts` | Exportar como named export para uso em testes |
| `Neo4jRepository` | `ai-service/src/repositories/Neo4jRepository.ts` | Três novos métodos adicionados; nenhum existente alterado |
| `<ReorderableGrid>` | `frontend/components/ReorderableGrid/ReorderableGrid.tsx` | Zero modificações — recebe `scores` atualizados via `recommendationSlice` |
| `demoSlice` | `frontend/store/demoSlice.ts` | Adicionar `demoBuyLoading: Record<string, boolean>` + `setDemoBuyLoading` |
| `recommendationSlice` | `frontend/store/recommendationSlice.ts` | Zero modificações — `setRecommendations()` existente atualiza os scores |
| `useCatalogOrdering` | `frontend/lib/hooks/useCatalogOrdering.ts` | Zero modificações |
| `useRecommendations` | `frontend/lib/hooks/useRecommendations.ts` | Zero modificações |

---

## Components

### AI Service — novos

#### `DemoBuyService`
**Localização:** `ai-service/src/services/DemoBuyService.ts`
**Responsabilidade:** Orquestrar o fluxo demo-buy: write Neo4j → recalcular profile vector → retornar recomendações.
**Injeção de dependência:** `constructor(private repo: Neo4jRepository, private recommendationService: RecommendationService)`

```
async demoBuy(clientId, productId, limit): Promise<RecommendationResult[]>
  1. repo.createDemoBoughtAndGetEmbeddings(clientId, productId) → embeddings[]
  2. if embeddings.length === 0 → throw ClientNoPurchaseHistoryError (cold start com produto sem embedding)
  3. profileVector = meanPooling(embeddings)
  4. return recommendationService.recommendFromVector(clientId, limit, profileVector)

async undoDemoBuy(clientId, productId, limit): Promise<RecommendationResult[]>
  1. repo.deleteDemoBoughtAndGetEmbeddings(clientId, productId) → embeddings[]
  2. if embeddings.length === 0 → return empty / throw (cliente sem histórico após undo)
  3. profileVector = meanPooling(embeddings)
  4. return recommendationService.recommendFromVector(clientId, limit, profileVector)

async clearAllDemoBought(clientId, limit): Promise<RecommendationResult[]>
  1. repo.clearAllDemoBoughtAndGetEmbeddings(clientId) → embeddings[]
  2. if embeddings.length === 0 → throw ClientNoPurchaseHistoryError
  3. profileVector = meanPooling(embeddings)
  4. return recommendationService.recommendFromVector(clientId, limit, profileVector)
```

#### `RecommendationService.recommendFromVector()` (novo método)
**Localização:** `ai-service/src/services/RecommendationService.ts` (método adicionado à classe existente)
**Assinatura:** `async recommendFromVector(clientId: string, limit: number, profileVector: number[]): Promise<RecommendResponse>`
**Comportamento:**
- Busca `client.country` via `repo.getClientWithCountry(clientId)` → para candidatos filtrados por país
- Busca `purchasedIds` via `repo.getPurchasedProductIds(clientId)` → para excluir já comprados (reais + demo) dos candidatos
- Busca `candidates` via `repo.getCandidateProducts(client.country, purchasedIds)`
- Executa scoring `tf.tidy()` com o `profileVector` fornecido (não recalcula)
- **`recommend()` existente não é alterado** — zero risco de regressão nos 42 testes existentes

#### `demoBuyRoutes.ts`
**Localização:** `ai-service/src/routes/demoBuyRoutes.ts`
**Endpoints:**

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/demo-buy` | `{ clientId: string, productId: string, limit?: number }` | `200 { recommendations: RecommendationResult[] }` |
| `DELETE` | `/demo-buy/:clientId/:productId` | — | `200 { recommendations: RecommendationResult[] }` |
| `DELETE` | `/demo-buy/:clientId` | — | `200 { recommendations: RecommendationResult[] }` |

**Error mapping:**
- `404` → `ClientNotFoundError`, `ProductNotFoundError` (novo)
- `400` → body malformado / campos ausentes
- `422` → `ClientNoPurchaseHistoryError` (cold start sem embedding)
- `503` → `Neo4jUnavailableError`, `ModelNotTrainedError`

#### `Neo4jRepository` — novos métodos

| Método | Cypher strategy | Retorno |
|--------|----------------|---------|
| `createDemoBoughtAndGetEmbeddings(clientId, productId)` | `session.executeWrite()`: MATCH Client, MATCH Product (→ 404 se não existe), MERGE `[:BOUGHT {is_demo: true, date: datetime()}]`, RETURN `p.embedding` de todos os `:BOUGHT` do cliente WHERE embedding IS NOT NULL | `number[][]` |
| `deleteDemoBoughtAndGetEmbeddings(clientId, productId)` | `session.executeWrite()`: MATCH `(c)-[r:BOUGHT {is_demo: true}]->(p WHERE p.id = $productId)` DELETE r, RETURN embeddings restantes | `number[][]` |
| `clearAllDemoBoughtAndGetEmbeddings(clientId)` | `session.executeWrite()`: MATCH `(c)-[r:BOUGHT {is_demo: true}]->()` DELETE r, RETURN embeddings de todos `:BOUGHT` restantes | `number[][]` |
| `productExists(productId)` | `MATCH (p:Product {id: $id}) RETURN count(p) > 0` | `boolean` |

**Nota:** `session.executeWrite()` em vez de `session.run()` — usa write transaction com retry automático do driver (comportamento consistente com ADR-021).

### Frontend — modificações

#### `demoSlice.ts` — adicionar loading state
```typescript
// Adicionar ao DemoSlice interface:
demoBuyLoading: Record<string, boolean>; // keyed por productId
setDemoBuyLoading: (productId: string, loading: boolean) => void;
```

#### `ProductCard.tsx` — adicionar Demo Buy button
Novos props adicionados:
```typescript
interface ProductCardProps {
  product: Product;
  onClick?: () => void;
  scoreBadge?: ScoreBadgeProps;
  // novos:
  isDemo?: boolean;          // exibe badge "demo" + botão "↩ Desfazer"
  isDemoBuyLoading?: boolean; // estado de loading do botão
  onDemoBuy?: () => void;    // callback ao clicar "🛒 Demo Comprar"
  onDemoUndo?: () => void;   // callback ao clicar "↩ Desfazer"
  showDemoBuy?: boolean;     // true quando cliente selecionado + modo IA ativo
}
```

**Comportamento do botão:**
- `showDemoBuy && !isDemo`: exibe `🛒 Demo Comprar` (desabilitado se `isDemoBuyLoading`)
- `isDemo`: exibe badge `demo` (Badge variant="warning") + botão `↩ Desfazer`
- Botão desabilitado durante `isDemoBuyLoading` para evitar cliques concorrentes (M9A-29)

#### `CatalogPanel.tsx` — wiring
- Busca `demoBoughtByClient[selectedClient.id]` do `demoSlice`
- Passa `isDemo`, `isDemoBuyLoading`, `showDemoBuy`, `onDemoBuy`, `onDemoUndo` para cada `ProductCard` via `renderItem`
- Adiciona botão "🗑 Limpar Demo (N)" na toolbar (visível quando N > 0)
- Handler `handleDemoBuy(productId)`: `setDemoBuyLoading(productId, true)` → `POST /demo-buy` → `setRecommendations()` + `addDemoBought()` → `setDemoBuyLoading(productId, false)`
- Handler `handleDemoUndo(productId)`: similar, chama `DELETE /demo-buy/:cId/:pId`
- Handler `handleClearAllDemo()`: chama `DELETE /demo-buy/:cId`, `clearDemoForClient(clientId)`

---

## Data Models

### Novo edge Neo4j
```
(:Client)-[:BOUGHT { is_demo: true, date: datetime() }]->(:Product)
```
Isolado das edges reais por `is_demo: true`. O `getPurchasedProductIds()` existente retorna todas as edges `:BOUGHT` (inclui demo) — correto: produto demo não deve aparecer como candidato de recomendação durante a sessão.

### Response DTO — `POST /demo-buy` (e DELETE variants)
```typescript
// Reutiliza RecommendationResult[] existente — sem novo DTO necessário
type DemoBuyResponse = RecommendationResult[]
// { id, name, category, price, sku, finalScore, neuralScore, semanticScore, matchReason }
```

---

## Error Handling Strategy

| Cenário | Camada | Tratamento |
|---------|--------|------------|
| `clientId` não existe no Neo4j | `DemoBuyService` → `ClientNotFoundError` | 404 na rota |
| `productId` não existe no Neo4j | `Neo4jRepository` → `ProductNotFoundError` (novo) | 404 na rota |
| Produto sem embedding no pool (embedding null) | `meanPooling` recebe array sem aquele produto — `getEmbeddings` já filtra `WHERE embedding IS NOT NULL` | Silencioso, correto |
| Cold start: cliente sem compras reais + 1 demo | `meanPooling([singleEmbedding])` = embedding único — válido | Funciona normalmente |
| `ModelNotTrainedError` de `recommendFromVector` | propagado para rota | 503 |
| Falha de rede no frontend | `try/catch` no handler → `toast.error()` via sonner, `setDemoBuyLoading(false)`, sem atualização de scores | M9A-30 |
| Cliques rápidos (concorrência UI) | `isDemoBuyLoading[productId]` desabilita botão | M9A-29 |

---

## Tech Decisions

| Decisão | Razão |
|---------|-------|
| `DemoBuyService` injetado via constructor (não singleton global) | Idiomático no projeto — `RecommendationService`, `ModelTrainer` seguem o mesmo padrão |
| `index.ts` do ai-service registra `demoBuyRoutes` com `demoBuyService` instanciado | Mesma factory pattern de `recommendRoutes`, `embeddingRoutes`, etc. |
| `meanPooling` e `cosine` exportados como named exports | Necessário para `DemoBuyService.ts` sem duplicação; funções puras sem efeitos colaterais |
| Limite padrão de 10 em `POST /demo-buy` se `limit` não informado | Consistência com `/recommend` |
| `sonner` para error toast no frontend | Já instalado no M8; padrão estabelecido |
| `DELETE /demo-buy/:clientId/:productId` sem body | ADR-022 |
| Write transaction unificada Neo4j | ADR-021 |

---

## Alternatives Discarded

| Node | Approach | Eliminated in | Reason |
|------|----------|---------------|--------|
| B | `DemoBuyService` executa todo o pipeline de scoring internamente, copiando `cosine`, `tf.tidy`, `neuralWeight` | Phase 2 | High severity × 2: scoring duplicado diverge silenciosamente + race condition no backend global do TF.js; viola Rule of Three |
| C | Refatorar `recommend()` para aceitar `profileVector?: number[]` opcional | Phase 3 | `recommend()` teria dois contratos de comportamento; risco de regressão nos 42 testes existentes; CUPID-U violado |

---

## Committee Findings Applied

| Finding | Persona | How incorporated |
|---------|---------|-----------------|
| Timing gap entre write e read Neo4j pode produzir profileVector sem a compra demo | Staff Engineering (High) + QA Staff (implicit) | `createDemoBoughtAndGetEmbeddings()` executa write + read na mesma `session.executeWrite()` — ADR-021 |
| DELETE com body é não confiável em proxies e gateways | Staff Engineering (Medium) | Rotas DELETE usam path params: `DELETE /demo-buy/:clientId/:productId` e `DELETE /demo-buy/:clientId` — ADR-022 |
| `recommend()` com parâmetro opcional viola SRP — dois modos de entrada | Principal SW Architect (Medium) | `recommendFromVector()` como método separado explícito; `recommend()` não alterado |
| Estado de loading individual por produto necessário para evitar cliques concorrentes | QA Staff (Medium) | `demoBuyLoading: Record<string, boolean>` adicionado ao `demoSlice` |

# M9-A — Demo Buy + Live Reorder — Specification

## Problem Statement

O avaliador do portfólio precisa ver o motor de recomendação reagir a uma nova compra em tempo real, sem esperar 2 minutos de retreinamento completo da rede neural. Atualmente, depois que o cliente está selecionado e os cards estão ordenados por IA, não existe forma de demonstrar que o sistema *aprende* — a ordem fica estática durante toda a sessão. O M9-A resolve isso: um clique em "Demo Comprar" em qualquer card atualiza o perfil do cliente via mean-pooling incremental e reordena as recomendações em ~300ms, tornando o aprendizado do sistema visível e tangível.

## Goals

- [ ] Avaliador consegue simular uma compra em qualquer produto do catálogo com um único clique e ver a reordenação animada em ≤ 350ms
- [ ] Cada compra demo fica claramente marcada no card (badge + botão "↩ Desfazer") sem poluir o histórico real do cliente
- [ ] Todas as compras demo de uma sessão podem ser desfeitas individualmente ou limpas de uma vez, restaurando o estado original com animação
- [ ] O estado demo não persiste entre reloads nem entre trocas de cliente — isolamento total de sessão

## Out of Scope

| Feature | Reason |
|---------|--------|
| Retreinamento da rede neural (`ModelTrainer`) | Opera no espaço dos pesos — latência de ~2min; coberto pelo M9-B |
| Online learning via `model.trainOnBatch()` | Rejeitado por catastrophic forgetting + thread safety (AD-013, Sessão 002 Caminho G) |
| Persistência de compras demo no PostgreSQL | Demo é efêmero por design — não cria pedidos reais |
| Paginação ou filtragem no endpoint `demo-buy` | Escopo de demonstração; candidatos são todos os produtos do catálogo |
| Multi-cliente simultâneo na mesma sessão | `demoSlice` é keyed por `clientId`; um cliente por vez por sessão |
| API pública do demo-buy sem autenticação de admin | Endpoint não destrutivo, sem dados sensíveis — sem key necessária |

---

## User Stories

### P1: Simular compra e ver reordenação ao vivo ⭐ MVP

**User Story**: Como avaliador do portfólio, quero clicar "🛒 Demo Comprar" em um produto e ver as recomendações se reordenarem em tempo real, para que eu entenda visualmente que o motor de recomendação responde a novas compras.

**Why P1**: É o coração do M9-A — sem isso o milestone não existe. Toda a infraestrutura (rota, edge Neo4j, mean-pooling incremental) serve esta única experiência.

**Acceptance Criteria**:

1. WHEN cliente está selecionado na navbar E catálogo está em modo "Ordenar por IA" THEN cada card SHALL exibir botão "🛒 Demo Comprar" habilitado
2. WHEN usuário clica "🛒 Demo Comprar" em um card THEN sistema SHALL chamar `POST /api/v1/demo-buy` com `{ clientId, productId }` e exibir loading state no botão durante a chamada
3. WHEN `POST /demo-buy` retorna com sucesso (≤ 350ms) THEN `<ReorderableGrid>` SHALL animar a reordenação dos cards com base nos novos scores retornados pela API
4. WHEN produto foi comprado na demo THEN seu card SHALL exibir badge "demo" e botão "↩ Desfazer" no lugar do "🛒 Demo Comprar"
5. WHEN catálogo NÃO está em modo IA (sem cliente selecionado ou ordenação original ativa) THEN botão "🛒 Demo Comprar" SHALL ficar oculto ou desabilitado

**Independent Test**: Selecionar cliente → clicar "✨ Ordenar por IA" → clicar "🛒 Demo Comprar" em um card de baixo score → confirmar que o card sobe na ordem e exibe badge "demo"

---

### P1: Rota `POST /api/v1/demo-buy` no AI Service ⭐ MVP

**User Story**: Como sistema de frontend, quero uma rota que aceite `{ clientId, productId }`, crie a edge demo no Neo4j, recalcule o perfil do cliente e retorne novas recomendações, para que a UI possa animar a reordenação sem latência perceptível.

**Why P1**: Fundação de backend sem a qual nenhuma outra story P1 funciona.

**Acceptance Criteria**:

1. WHEN `POST /api/v1/demo-buy` recebe `{ clientId: string, productId: string }` válidos THEN sistema SHALL criar edge `(:Client)-[:BOUGHT { is_demo: true, date: now() }]->(:Product)` no Neo4j
2. WHEN edge criada THEN sistema SHALL reler todos os embeddings de produtos comprados pelo cliente (reais + demo) via `getClientPurchasedEmbeddings()` e recalcular `clientProfileVector` via `meanPooling()`
3. WHEN perfil recalculado THEN sistema SHALL chamar `recommend()` existente com o novo `profileVector` e retornar a lista completa de produtos rankeados com scores
4. WHEN latência total (`demo-buy` → resposta) THEN sistema SHALL retornar em ≤ 350ms p95 (meta: 180–250ms)
5. WHEN `clientId` ou `productId` não existem no Neo4j THEN sistema SHALL retornar `404 Not Found` com mensagem descritiva
6. WHEN request body está malformado ou campos ausentes THEN sistema SHALL retornar `400 Bad Request` com detalhes de validação
7. WHEN produto já foi comprado (real ou demo) pelo cliente THEN sistema SHALL criar a edge igualmente (reforço de sinal) e retornar recomendações atualizadas — sem erro de duplicata

**Independent Test**: `curl -X POST /api/v1/demo-buy -d '{"clientId":"1","productId":"10"}'` → verificar edge `is_demo: true` no Neo4j Browser + validar que response contém array `recommendations` com scores

---

### P1: Desfazer compra demo individualmente ⭐ MVP

**User Story**: Como avaliador, quero clicar "↩ Desfazer" em um card de produto que eu comprei na demo para remover aquela compra específica e ver as recomendações se reajustarem, para que eu possa comparar o antes e depois com precisão.

**Why P1**: Sem desfazer, a demo é unidirecional. O avaliador precisa poder reverter para demonstrar o contraste e provar que o sistema reage em ambas as direções.

**Acceptance Criteria**:

1. WHEN usuário clica "↩ Desfazer" em card com badge "demo" THEN sistema SHALL chamar `DELETE /api/v1/demo-buy` com `{ clientId, productId }`
2. WHEN `DELETE /demo-buy` retorna com sucesso THEN sistema SHALL remover a edge `is_demo: true` do Neo4j para o par `(clientId, productId)` e retornar novas recomendações recalculadas sem aquela compra
3. WHEN recomendações retornam THEN `<ReorderableGrid>` SHALL animar a reordenação de volta
4. WHEN card desfeito THEN badge "demo" e botão "↩ Desfazer" SHALL ser substituídos pelo "🛒 Demo Comprar" novamente

**Independent Test**: Demo comprar produto → confirmar reordenação → clicar "↩ Desfazer" → confirmar que card volta à posição anterior com animação e badge desaparece

---

### P2: Limpar todas as compras demo de uma vez

**User Story**: Como avaliador, quero um botão "🗑 Limpar Demo" na toolbar do catálogo para desfazer todas as compras simuladas da sessão de uma vez, para que eu possa resetar a demonstração rapidamente sem clicar "↩ Desfazer" em cada card individualmente.

**Why P2**: Qualidade-de-vida para sessões de demo longas com múltiplos produtos comprados. Não bloqueia o MVP mas melhora significativamente a experiência de apresentação.

**Acceptance Criteria**:

1. WHEN existem compras demo ativas no `demoSlice` para o cliente atual THEN toolbar SHALL exibir botão "🗑 Limpar Demo" com contador `(N)`
2. WHEN usuário clica "🗑 Limpar Demo" THEN sistema SHALL chamar `DELETE /api/v1/demo-buy/all` com `{ clientId }`, remover todas as edges `is_demo: true` do cliente, retornar recomendações sem compras demo
3. WHEN resposta chega THEN todos os badges "demo" SHALL desaparecer, `<ReorderableGrid>` SHALL animar a reordenação, e botão "🗑 Limpar Demo" SHALL desaparecer da toolbar
4. WHEN não há compras demo ativas THEN botão "🗑 Limpar Demo" SHALL estar oculto

**Independent Test**: Demo comprar 3 produtos → confirmar botão "🗑 Limpar Demo (3)" → clicar → confirmar que todos os 3 cards perdem badge e grid reordena

---

### P2: Isolamento de estado demo entre clientes

**User Story**: Como sistema, quero que o estado demo seja automaticamente limpo quando o usuário troca de cliente na navbar, para que compras demo do cliente anterior não contaminem a sessão do novo cliente.

**Why P2**: Sem isolamento, o `demoSlice` acumularia compras de múltiplos clientes criando edges Neo4j órfãs. É um requisito de correção, não apenas UX.

**Acceptance Criteria**:

1. WHEN usuário troca `selectedClient` no dropdown da navbar THEN `demoSlice` SHALL limpar automaticamente as compras demo do cliente anterior SEM chamar `DELETE /demo-buy` (as edges Neo4j `is_demo: true` do cliente anterior são efêmeras e são limpas na próxima sessão ou via cron)
2. WHEN novo cliente é selecionado THEN catálogo SHALL carregar sem nenhum badge "demo" visível
3. WHEN usuário reseleciona o cliente original THEN compras demo anteriores NÃO SHALL ser restauradas (estado limpo)

**Independent Test**: Demo comprar produto para cliente A → trocar para cliente B → confirmar zero badges → voltar para cliente A → confirmar zero badges

---

### P3: Rota `DELETE /api/v1/demo-buy/all` para limpeza bulk

**User Story**: Como sistema, quero um endpoint que remova todas as edges `is_demo: true` de um `clientId` de uma vez, para suportar o botão "🗑 Limpar Demo" e a limpeza automática ao trocar de cliente.

**Why P3**: Depende do botão P2 "Limpar Demo" ser implementado primeiro. O endpoint individual `DELETE /demo-buy` (P1) cobre o MVP.

**Acceptance Criteria**:

1. WHEN `DELETE /api/v1/demo-buy/all` recebe `{ clientId }` THEN sistema SHALL remover todas as edges `[:BOUGHT { is_demo: true }]` do cliente no Neo4j via `MATCH (c:Client {id: $clientId})-[r:BOUGHT {is_demo: true}]->() DELETE r`
2. WHEN limpeza executada THEN sistema SHALL recalcular `clientProfileVector` apenas com as compras reais e retornar recomendações atualizadas
3. WHEN `clientId` não tem compras demo THEN sistema SHALL retornar `200 OK` com recomendações atuais (operação idempotente)

**Independent Test**: Criar 3 edges `is_demo: true` via `POST /demo-buy` → chamar `DELETE /demo-buy/all` → verificar no Neo4j Browser que nenhuma edge `is_demo: true` existe para o cliente

---

## Edge Cases

- WHEN usuário clica "🛒 Demo Comprar" rapidamente em múltiplos cards em sequência THEN cada clique SHALL ser processado sequencialmente — botão SHALL ficar desabilitado durante o loading para evitar requests concorrentes que criariam inconsistência no `clientProfileVector`
- WHEN `POST /demo-buy` falha (timeout, 500) THEN UI SHALL exibir toast de erro via `sonner`, restaurar botão para "🛒 Demo Comprar", NÃO atualizar a ordem dos cards
- WHEN produto demo comprado tem embedding `null` no Neo4j THEN AI Service SHALL excluir aquele produto do `meanPooling()` (mesmo comportamento do `getClientPurchasedEmbeddings()` existente) e prosseguir sem erro
- WHEN cliente não tem compras reais (cold start) E demo compra 1 produto THEN `clientProfileVector` SHALL ser o embedding único daquele produto — `meanPooling([embedding])` = o próprio embedding
- WHEN reload de página THEN `demoSlice` SHALL ser limpo (estado volátil, sem `persist`) — edges `is_demo: true` no Neo4j ficam temporariamente órfãs mas são inofensivas (não aparecem na UI; podem ser limpas por cron futuro)
- WHEN catálogo tem filtros ativos (categoria, país) THEN "🛒 Demo Comprar" SHALL funcionar normalmente — produto fora do filtro ativo pode existir no Neo4j mas não aparece no grid atual

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---------------|-------|-------|--------|
| M9A-01 | P1: Botão Demo Comprar visível com cliente+IA ativos | Design | Pending |
| M9A-02 | P1: Clique chama POST /demo-buy com clientId+productId | Design | Pending |
| M9A-03 | P1: Loading state no botão durante chamada | Design | Pending |
| M9A-04 | P1: ReorderableGrid anima com novos scores | Design | Pending |
| M9A-05 | P1: Badge "demo" aparece no card após compra | Design | Pending |
| M9A-06 | P1: Botão muda para "↩ Desfazer" após compra | Design | Pending |
| M9A-07 | P1: Botão oculto/desabilitado sem cliente ou sem modo IA | Design | Pending |
| M9A-08 | P1: POST /demo-buy cria edge BOUGHT is_demo:true no Neo4j | Design | Pending |
| M9A-09 | P1: POST /demo-buy relê embeddings e recalcula meanPooling | Design | Pending |
| M9A-10 | P1: POST /demo-buy chama recommend() com novo profileVector | Design | Pending |
| M9A-11 | P1: Latência p95 ≤ 350ms | Design | Pending |
| M9A-12 | P1: 404 para clientId/productId inexistentes | Design | Pending |
| M9A-13 | P1: 400 para body malformado | Design | Pending |
| M9A-14 | P1: Compra duplicada não gera erro (reforço de sinal) | Design | Pending |
| M9A-15 | P1: Desfazer clique chama DELETE /demo-buy com clientId+productId | Design | Pending |
| M9A-16 | P1: DELETE /demo-buy remove edge is_demo:true do Neo4j | Design | Pending |
| M9A-17 | P1: DELETE /demo-buy retorna recomendações recalculadas | Design | Pending |
| M9A-18 | P1: ReorderableGrid anima ao desfazer | Design | Pending |
| M9A-19 | P1: Card restaura botão "🛒 Demo Comprar" após desfazer | Design | Pending |
| M9A-20 | P2: Botão "🗑 Limpar Demo (N)" na toolbar quando há demos ativas | Design | Pending |
| M9A-21 | P2: Limpar Demo chama DELETE /demo-buy/all | Design | Pending |
| M9A-22 | P2: Todos os badges "demo" desaparecem após limpeza bulk | Design | Pending |
| M9A-23 | P2: demoSlice limpo automaticamente ao trocar de cliente | Design | Pending |
| M9A-24 | P2: Novo cliente não herda badges demo do anterior | Design | Pending |
| M9A-25 | P2: Cliente reescolhido não restaura demos anteriores | Design | Pending |
| M9A-26 | P3: DELETE /demo-buy/all remove todas edges is_demo do clientId | Design | Pending |
| M9A-27 | P3: DELETE /demo-buy/all recalcula perfil com compras reais apenas | Design | Pending |
| M9A-28 | P3: DELETE /demo-buy/all é idempotente (sem demos → 200 OK) | Design | Pending |
| M9A-29 | Edge: Cliques rápidos sequenciais — botão desabilitado durante loading | Design | Pending |
| M9A-30 | Edge: Falha de rede → toast de erro, sem atualização de ordem | Design | Pending |
| M9A-31 | Edge: Produto com embedding null excluído do meanPooling sem erro | Design | Pending |
| M9A-32 | Edge: Cold start (0 compras reais) → profileVector = embedding do produto demo | Design | Pending |
| M9A-33 | Edge: Reload de página → demoSlice zerado, sem estado demo na UI | Design | Pending |

**Coverage:** 33 total, 0 mapped to tasks, 33 unmapped ⚠️

---

## Contexto Técnico Relevante (para Design)

### Decisões já tomadas

- **AD-013**: Demo Buy opera no `clientProfileVector` (mean-pooling), não nos pesos da rede neural. `ModelTrainer` não é alterado.
- **AD-012**: `<ReorderableGrid>` reutilizável (implementado no M8) recebe `scores` como prop e executa a animação — sem modificação.
- **AD-019**: `demoSlice` (volátil, sem persist) gerencia `demoBought: Record<clientId, Set<productId>>`. Limpeza automática via cross-slice subscribe ao `clientSlice`.
- **AD-020**: Aba "Análise" já existe com `ClientProfileCard` + comparação Sem IA vs Com IA — M9-A não altera o TabNav.

### Componentes existentes reutilizáveis

| Componente / Método | Localização | Como reutilizar no M9-A |
|--------------------|-------------|------------------------|
| `<ReorderableGrid>` | `frontend/src/components/ReorderableGrid/` | Passar novos `scores` do `demo-buy` response para animar |
| `useRecommendations()` | domain hook Zustand | Adicionar ação `setRecommendationsFromDemo(scores)` |
| `demoSlice` | `frontend/src/store/demoSlice.ts` | Adicionar `demoBought: Record<clientId, productId[]>` + `addDemoBought` + `removeDemoBought` + `clearDemoBought` |
| `Neo4jRepository` | `ai-service/src/repositories/Neo4jRepository.ts` | Adicionar `createDemoBought(clientId, productId)`, `deleteDemoBought(clientId, productId)`, `clearAllDemoBought(clientId)` |
| `RecommendationService.recommend()` | `ai-service/src/services/RecommendationService.ts` | Chamado diretamente com `profileVector` recalculado — sem modificação |
| `getClientPurchasedEmbeddings()` | `Neo4jRepository` | Já inclui todas edges `:BOUGHT` — incluirá `is_demo: true` automaticamente |
| `meanPooling()` | `ai-service/src/services/RecommendationService.ts` | Reutilizar sem modificação |

### Novo endpoint a criar

```
POST /api/v1/demo-buy
Body: { clientId: string, productId: string }
Response 200: { recommendations: Array<{ productId, score, neuralScore, semanticScore, name, ... }> }
Response 400: { error: string, details: string }
Response 404: { error: string }

DELETE /api/v1/demo-buy
Body: { clientId: string, productId: string }
Response 200: { recommendations: Array<...> }
Response 404: { error: string }

DELETE /api/v1/demo-buy/all
Body: { clientId: string }
Response 200: { recommendations: Array<...> }
```

### Latência estimada (AD-013)
- `createDemoBought` Neo4j write: ~30ms
- `getClientPurchasedEmbeddings` + `meanPooling`: ~50ms  
- `recommend()` (cosine + neural predict): ~80–150ms
- **Total estimado: 160–230ms** → meta p95 ≤ 350ms é conservadora

---

## Success Criteria

- [ ] Avaliador consegue completar o fluxo "selecionar cliente → ordenar por IA → demo comprar produto → ver reordenação" sem erros em ≤ 350ms por ação
- [ ] Badge "demo" e botão "↩ Desfazer" aparecem corretamente em todos os produtos demo comprados
- [ ] Desfazer individual funciona e anima a reordenação reversa
- [ ] Trocar de cliente limpa todos os badges demo sem deixar estado sujo
- [ ] Nenhuma compra demo aparece no histórico real do cliente (`GET /api/v1/clients/{id}/orders` não retorna pedidos demo)
- [ ] `tsc --noEmit` sem erros, `npm run build` ✓, ESLint ✓ 0 warnings no frontend
- [ ] `tsc --noEmit` sem erros no ai-service, todos os testes Vitest existentes continuam passando

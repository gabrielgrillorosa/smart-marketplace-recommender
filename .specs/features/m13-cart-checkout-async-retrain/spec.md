# M13 — Cart, Checkout & Async Retrain Capture — Especificação

## Problema

O fluxo atual `Demo Comprar → BOUGHT {is_demo: true} → Treino` mistura **intenção de sessão** (carrinho) com **evento confirmado de treino** (pedido). Isso causa:

1. `precisionAt5` calculado sobre `orders` reais diverge dos demos usados no treino — train/eval mismatch (B-001).
2. `Com Demo` congela na primeira compra e as colunas de análise param de refletir a sessão real.
3. Demos persistem indefinidamente no Neo4j após reload, acumulando sinal artificial.
4. `ModelTrainer` mescla `demoPairs` sem que haja um evento explícito de confirmação — o modelo aprende de intenções, não de compras.

O M13 resolve isso substituindo o fluxo por `Adicionar ao Carrinho → Efetivar Compra → Order confirmada → Treino assíncrono`, tornando `Order` o único ground truth.

## Goals

- [ ] Carrinho persistido no `api-service` (PostgreSQL): adicionar item, remover item, esvaziar, efetivar checkout
- [ ] `POST /carts/{clientId}/checkout` cria `Order` real, sincroniza com Neo4j e dispara retrain assíncrono
- [ ] `ai-service` expõe `recommendFromCart(clientId, productIds[])` usando embeddings pré-computados via `meanPooling` em memória
- [ ] `ModelTrainer` para de mesclar `demoPairs`; `computePrecisionAtK` opera somente sobre `orders` confirmadas
- [ ] `RetrainPanel` renomeado para `ModelStatusPanel` com 5 estados visuais explícitos (AD-044)
- [ ] `useRetrainJob` evoluído para `useModelStatus` com polling em `/model/status` por mudança de `currentVersion` (AD-045)
- [ ] `analysisSlice.awaitingRetrainSince` persistido no `localStorage` — sobrevive a reload
- [ ] Promotion gate com banda de tolerância `MODEL_PROMOTION_TOLERANCE` configurável via env (AD-039)
- [ ] `GET /model/status` expõe `currentVersion`, `lastTrainingResult`, `lastTrainingTriggeredBy`, `lastOrderId` (AD-040/AD-045)
- [ ] Edges legadas `BOUGHT {is_demo: true}` limpas/ignoradas no `ModelTrainer` e `computePrecisionAtK`
- [ ] Botão "Retreinar Modelo" movido para seção colapsável `Avançado` no `ModelStatusPanel`
- [ ] `useRetrainJob` → `useModelStatus` renomeado com nova fonte de verdade

## Fora de Escopo

| Feature | Motivo |
|---|---|
| Validação por país em `POST /carts/{clientId}/items` | Escopo de M15 — Cart Integrity |
| Vocabulário frontend completo (`Demo Comprar → Carrinho`, `demoSlice → cartSlice`) | Escopo de M14 — Catalog Score Visibility & Cart-Aware Showcase |
| Scores em todo o catálogo (`limit: 100`) | Escopo de M14 |
| `ClientProfileCard` com dados reais de pedidos | Escopo de M15 |
| SSE/WebSocket para eventos do modelo | Deferred — pós-MVP |
| `recommendFromCandidate` para mostrar candidato rejeitado | Deferred — pós-MVP |
| Migração de vocabulário completo no frontend (badges, labels de análise) | Escopo de M14 |

---

## Decisão sobre Frequência de Retrain Pós-Checkout

> **Gray area identificada (STATE.md — Todos):** Decidir entre `every_checkout` / `debounce 30s` / `min_orders_gate >= 2` para `expectedTrainingTriggered` na resposta de checkout.

**Decisão adotada neste spec: `every_checkout` (sem throttling no MVP).**

**Justificativa:** O dataset tem ~20 clientes e operações de checkout são manuais durante a demo. Cada checkout é um evento deliberado do avaliador — não há risco de storm de checkouts concorrentes. O `TrainingJobRegistry` já serializa jobs (enfileira se um job ativo existe) e o `StartupRecoveryService` (M12) prova que o sistema sobrevive a enfileiramento concorrente. A banda de tolerância (AD-039) já protege contra promoção de modelo pior. Para produção real, `debounce` ou `min_orders_gate` seriam os padrões corretos — registrado como `Deferred Idea`.

**Consequência:** `POST /carts/{clientId}/checkout` sempre retorna `expectedTrainingTriggered: true` quando existe pelo menos 1 item no carrinho. O frontend sempre entra em estado `training` no `ModelStatusPanel` após checkout bem-sucedido.

---

## User Stories

### P1: Carrinho persistido no api-service ⭐ MVP

**User Story:** Como avaliador, quero adicionar produtos ao carrinho e visualizar o estado `Com Carrinho` no painel de Análise para entender como minha intenção atual afetaria as recomendações antes de confirmar a compra.

**Por que P1:** Sem o carrinho, não há como separar intenção de confirmação — é a fundação de toda a arquitetura do M13.

**Acceptance Criteria:**

1. WHEN `POST /api/v1/carts/{clientId}/items` é chamado com `{ productId, quantity }` THEN `api-service` SHALL criar ou atualizar `CartItem` no PostgreSQL com status `ACTIVE` e retornar `200` com o carrinho atualizado `{ cartId, clientId, items: [{ productId, quantity }], itemCount }`
2. WHEN `DELETE /api/v1/carts/{clientId}/items/{productId}` é chamado THEN `api-service` SHALL remover o item do carrinho e retornar `200` com o carrinho atualizado
3. WHEN `DELETE /api/v1/carts/{clientId}` é chamado THEN `api-service` SHALL esvaziar todos os itens do carrinho e retornar `200`
4. WHEN `GET /api/v1/carts/{clientId}` é chamado THEN `api-service` SHALL retornar o carrinho ativo do cliente com todos os itens atuais
5. WHEN um cliente não tem carrinho ativo THEN `GET /api/v1/carts/{clientId}` SHALL retornar `{ cartId: null, items: [], itemCount: 0 }`
6. WHEN o mesmo produto é adicionado duas vezes THEN `api-service` SHALL somar as quantidades (upsert por `productId`)

**Independent Test:** Fazer `POST /items` com 2 produtos → `GET /carts/{clientId}` retorna `itemCount: 2` → `DELETE /items/{productId}` → `GET` retorna `itemCount: 1`.

---

### P1: Checkout cria Order real e dispara retrain assíncrono ⭐ MVP

**User Story:** Como avaliador, quero efetivar a compra do carrinho para que o sistema crie um pedido real, sincronize com o Neo4j e dispare o retreinamento do modelo — tornando visível o ciclo completo de aprendizado.

**Por que P1:** É o evento central da arquitetura AD-043 — sem checkout não há `Order` como ground truth e o ciclo de aprendizado não fecha.

**Acceptance Criteria:**

1. WHEN `POST /api/v1/carts/{clientId}/checkout` é chamado com carrinho não-vazio THEN `api-service` SHALL criar `Order` + `OrderItems` no PostgreSQL, esvaziar o `Cart`, chamar `ai-service` para sincronizar edges `BOUGHT` reais no Neo4j (sem `is_demo`), e retornar `201` com `{ orderId, expectedTrainingTriggered: true }`
2. WHEN checkout é chamado com carrinho vazio THEN `api-service` SHALL retornar `422` com mensagem `"Cart is empty — add items before checkout"`
3. WHEN a sincronização com `ai-service` falha THEN `api-service` SHALL registrar o erro em log mas não reverter o `Order` (fire-and-forget, consistente com ADR-015)
4. WHEN checkout é concluído com sucesso THEN `ai-service` SHALL enfileirar job de retrain via `TrainingJobRegistry.enqueue()` sem bloquear a resposta HTTP
5. WHEN um job de retrain já está ativo THEN `TrainingJobRegistry` SHALL enfileirar o novo job (sem disparar dois treinos simultâneos)

**Independent Test:** POST `/checkout` → resposta `{ orderId, expectedTrainingTriggered: true }` → `GET /api/v1/orders/{clientId}` mostra novo pedido → `GET /model/train/status/{jobId}` mostra job enfileirado ou em execução.

---

### P1: recommendFromCart — recomendação baseada no carrinho ⭐ MVP

**User Story:** Como avaliador, quero ver na coluna `Com Carrinho` do painel de Análise como as recomendações mudam ao refletir os produtos no meu carrinho atual — sem precisar confirmar a compra.

**Por que P1:** É o substituto direto do `recommendFromVector` com `is_demo` — sem ele, a coluna `Com Carrinho` não existe.

**Acceptance Criteria:**

1. WHEN `POST /api/v1/recommend/from-cart` é chamado com `{ clientId, productIds[] }` THEN `ai-service` SHALL ler os embeddings dos `productIds` do Neo4j, combinar via `meanPooling` com os embeddings de pedidos reais do cliente (`orders`), e chamar `recommendFromVector` retornando os top-N produtos ranqueados
2. WHEN `productIds` está vazio THEN `ai-service` SHALL tratar como `recommendFromVector` usando apenas o perfil baseado em `orders` (comportamento idêntico ao endpoint `/recommend`)
3. WHEN um `productId` não tem embedding no Neo4j THEN `ai-service` SHALL ignorar esse produto no `meanPooling` sem retornar erro (degradação silenciosa)
4. WHEN `clientId` não tem pedidos prévios THEN `ai-service` SHALL calcular o perfil apenas com os embeddings dos `productIds` do carrinho
5. WHEN o endpoint é chamado THEN resposta SHALL ter formato idêntico ao `POST /recommend` existente: `{ clientId, recommendations: [{ productId, score, neuralScore, semanticScore, ... }] }`

**Independent Test:** Criar carrinho com 2 produtos `beverages/Ambev` → `POST /recommend/from-cart` → resposta com scores; comparar com `POST /recommend` sem carrinho — top produtos devem mudar para refletir a categoria dos itens do carrinho.

---

### P1: ModelTrainer opera somente com Orders confirmadas ⭐ MVP

**User Story:** Como sistema, quero que o `ModelTrainer` treine somente com pedidos confirmados (`orders` do PostgreSQL) para que `precisionAt5` reflita fielmente o universo de treino e o train/eval mismatch (B-001) seja eliminado.

**Por que P1:** Fecha o blocker B-001 — sem isso, a métrica de qualidade do modelo continua enganosa.

**Acceptance Criteria:**

1. WHEN `ModelTrainer.train()` é executado THEN SHALL não chamar `getAllDemoBoughtPairs()` nem mesclar `demoPairs` no `clientOrderMap`
2. WHEN `computePrecisionAtK()` é executado THEN SHALL usar somente `orders` do PostgreSQL para construir o `clientOrderMap` de holdout
3. WHEN edges `BOUGHT {is_demo: true}` existem no Neo4j THEN `ModelTrainer` SHALL ignorá-las completamente (nem ler, nem incluir)
4. WHEN o treino finaliza com 0 edges `is_demo` THEN `trainingSamples` SHALL refletir apenas o volume baseado em `orders` reais

**Independent Test:** Treinar modelo sem nenhuma edge `is_demo` ativa → `trainingSamples` deve ser idêntico ao baseline pré-M10 (antes de ADR-026) → `precisionAt5` calculado somente sobre `orders`.

---

### P1: GET /model/status estendido com governança explícita ⭐ MVP

**User Story:** Como frontend, quero que `GET /model/status` retorne `currentVersion`, `lastTrainingResult`, `lastTrainingTriggeredBy` e `lastOrderId` para que o `ModelStatusPanel` possa exibir estados `idle/training/promoted/rejected/failed` com contexto.

**Por que P1:** Sem esses campos, `useModelStatus` não consegue detectar mudança de versão nem distinguir `promoted` de `rejected` — AD-045 depende disso.

**Acceptance Criteria:**

1. WHEN `GET /model/status` é chamado THEN SHALL retornar o payload existente acrescido de: `currentVersion: string | null`, `lastTrainingResult: 'promoted' | 'rejected' | 'failed' | null`, `lastTrainingTriggeredBy: 'checkout' | 'manual' | null`, `lastOrderId: string | null`
2. WHEN nenhum treino foi executado ainda THEN `currentVersion`, `lastTrainingResult`, `lastTrainingTriggeredBy` e `lastOrderId` SHALL ser `null`
3. WHEN o treino é disparado por checkout THEN `lastTrainingTriggeredBy` SHALL ser `'checkout'` e `lastOrderId` SHALL conter o `orderId` do checkout
4. WHEN o treino é disparado pelo botão manual THEN `lastTrainingTriggeredBy` SHALL ser `'manual'` e `lastOrderId` SHALL ser `null`
5. WHEN o modelo candidato supera o gate de tolerância THEN `lastTrainingResult` SHALL ser `'promoted'` e `currentVersion` SHALL ser atualizado
6. WHEN o modelo candidato fica abaixo do gate THEN `lastTrainingResult` SHALL ser `'rejected'` e `currentVersion` SHALL permanecer inalterado
7. WHEN `lastTrainingResult` é `'rejected'` THEN `GET /model/status` SHALL também retornar `lastDecision: { accepted: false, reason: string, currentPrecisionAt5: number, candidatePrecisionAt5: number, tolerance: number }`

**Independent Test:** Treinar modelo → `GET /model/status` → `currentVersion` não nulo, `lastTrainingResult` preenchido, `lastTrainingTriggeredBy` correto.

---

### P1: Promotion gate com banda de tolerância (AD-039) ⭐ MVP

**User Story:** Como sistema, quero que a promoção do modelo use `candidatePrecisionAt5 >= currentPrecisionAt5 - tolerance` para evitar rejeitar modelos genuinamente bons em datasets pequenos com oscilação estatística.

**Por que P1:** Com `every_checkout` como política de retrain, a banda protege contra promoções e rejeições excessivamente rígidas no dataset pequeno do MVP.

**Acceptance Criteria:**

1. WHEN `VersionedModelStore.saveVersioned()` é chamado THEN SHALL comparar `candidatePrecisionAt5 >= currentPrecisionAt5 - tolerance` onde `tolerance = parseFloat(process.env.MODEL_PROMOTION_TOLERANCE ?? '0.02')`
2. WHEN o candidato passa no gate THEN SHALL promover o modelo: `setModel(candidate)`, atualizar `currentVersion`, registrar `lastTrainingResult: 'promoted'`
3. WHEN o candidato falha no gate THEN SHALL manter o modelo atual: não chamar `setModel`, registrar `lastTrainingResult: 'rejected'` com `reason: "candidatePrecisionAt5 {X} < currentPrecisionAt5 {Y} - tolerance {Z}"`
4. WHEN `currentPrecisionAt5` é `null` (primeiro treino) THEN SHALL promover sempre (sem comparação)
5. WHEN `MODEL_PROMOTION_TOLERANCE=0` THEN gate SHALL usar comparação estritamente `>=` (sem banda)

**Independent Test:** Simular dois treinos consecutivos onde o segundo tem `precisionAt5` levemente inferior (dentro de 0.02) → modelo deve ser promovido → `lastTrainingResult: 'promoted'`. Simular `precisionAt5` abaixo de `current - 0.02` → `lastTrainingResult: 'rejected'`.

---

### P1: ModelStatusPanel com 5 estados visuais (AD-044) ⭐ MVP

**User Story:** Como avaliador, quero que o `ModelStatusPanel` reflita o estado real do modelo (`idle/training/promoted/rejected/failed`) para entender o que está acontecendo no ciclo de aprendizado sem precisar inspecionar logs.

**Por que P1:** Sem o painel, a coluna `Pós-Efetivar` aparece "do nada" e quebra a narrativa pedagógica — é o requisito central de AD-044.

**Acceptance Criteria:**

1. WHEN não há retrain em andamento e nenhum resultado recente THEN `ModelStatusPanel` SHALL exibir estado `idle` com texto "Aguardando próximo pedido para aprender" e o modelo atual ativo
2. WHEN checkout retorna `expectedTrainingTriggered: true` THEN `ModelStatusPanel` SHALL transicionar imediatamente para estado `training` com barra de progresso `TrainingProgressBar` (ADR-024 `scaleX`) e texto "Aprendendo com pedido #{orderId}"
3. WHEN `useModelStatus` detecta `currentVersion` mudando de `vN` para `vN+1` THEN `ModelStatusPanel` SHALL transicionar para estado `promoted` com card verde + delta `precisionAt5` + botão "Ver recomendações atualizadas" que ancora na coluna `Pós-Efetivar`
4. WHEN `useModelStatus` detecta `lastTrainingResult: 'rejected'` sem mudança de `currentVersion` THEN `ModelStatusPanel` SHALL exibir estado `rejected` com card âmbar + "Modelo candidato vN+1 rejeitado — modelo vN mantido" + motivo da rejeição do `lastDecision`
5. WHEN ocorre erro no job de treino THEN `ModelStatusPanel` SHALL exibir estado `failed` com card vermelho + mensagem de erro + botão "Tentar novamente" (só ativo se seção `Avançado` estiver visível)
6. WHEN o botão "Retreinar Modelo" (legado) está presente THEN SHALL estar dentro de um `<Collapsible>` com label "Avançado / Modo demo" e badge visual indicando "fora do fluxo principal"
7. WHEN `ModelStatusPanel` exibe estado `training` e o usuário navega para outra aba THEN ao retornar SHALL continuar exibindo o estado correto (always-mounted, ADR-023)

**Independent Test:** Fazer checkout → `ModelStatusPanel` mostra `training` imediatamente → aguardar polling detectar `promoted` ou `rejected` → painel exibe o estado correto com informações do modelo.

---

### P1: useModelStatus com polling em /model/status por versão (AD-045) ⭐ MVP

**User Story:** Como sistema, quero que `useModelStatus` monitore `GET /model/status` por mudança de `currentVersion` para capturar a coluna `Pós-Efetivar` de forma assíncrona — sobrevivendo a reloads de página.

**Por que P1:** É o mecanismo técnico de AD-045 sem o qual a coluna `Pós-Efetivar` nunca seria preenchida automaticamente.

**Acceptance Criteria:**

1. WHEN `expectedTrainingTriggered: true` é recebido no checkout THEN `useModelStatus` SHALL iniciar polling em `GET /model/status` com intervalo de 2s e registrar `awaitingRetrainSince: Date.now()` e `lastObservedVersion` no `analysisSlice`
2. WHEN polling detecta `currentVersion` diferente do `lastObservedVersion` THEN `useModelStatus` SHALL chamar `fetchRecs(clientId)` → `captureRetrained(clientId, recs)` e parar o polling
3. WHEN polling detecta `lastTrainingResult: 'rejected'` sem mudança de `currentVersion` THEN `useModelStatus` SHALL parar o polling e disparar transição para estado `rejected` no `ModelStatusPanel`
4. WHEN 90 segundos se passam sem mudança de `currentVersion` nem `rejected/failed` THEN `useModelStatus` SHALL parar o polling e exibir estado `unknown` com botão "Recarregar status" no `ModelStatusPanel`
5. WHEN a página é recarregada (F5) com `awaitingRetrainSince` persistido no `localStorage` THEN `useModelStatus` SHALL retomar o polling automaticamente ao montar
6. WHEN o retrain foi disparado por `manual` (botão Avançado) THEN `useModelStatus` SHALL operar identicamente — a fonte de verdade é sempre `currentVersion`, não `triggeredBy`
7. WHEN `analysisSlice` é persistido THEN `awaitingRetrainSince`, `lastObservedVersion` e `awaitingForOrderId` SHALL estar incluídos no `partialize` do `persist`

**Independent Test:** Fazer checkout → `awaitingRetrainSince` persistido no `localStorage` → recarregar página → polling retomado → quando modelo promovido, coluna `Pós-Efetivar` é preenchida.

---

### P1: RetrainPanel renomeado para ModelStatusPanel ⭐ MVP

**User Story:** Como desenvolvedor, quero que `RetrainPanel.tsx` seja renomeado para `ModelStatusPanel.tsx` com atualização de todos os imports e referências, para refletir a nova responsabilidade do componente.

**Por que P1:** Renomear é fundação para todas as outras stories do `ModelStatusPanel` — sem isso, mudanças ficam espalhadas em dois nomes.

**Acceptance Criteria:**

1. WHEN build é executado THEN `RetrainPanel.tsx` SHALL não existir; `ModelStatusPanel.tsx` SHALL existir em seu lugar
2. WHEN `AnalysisPanel.tsx` é renderizado THEN SHALL importar `ModelStatusPanel` (não `RetrainPanel`)
3. WHEN testes E2E rodam THEN `m9b-deep-retrain.spec.ts` SHALL ser renomeado ou novo spec `m13-cart-async-retrain.spec.ts` SHALL cobrir o fluxo de checkout
4. WHEN `useRetrainJob` é importado THEN SHALL existir como alias de `useModelStatus` ou ser completamente substituído por `useModelStatus`

**Independent Test:** `grep -r "RetrainPanel" src/` retorna zero resultados; `npm run build` e `npm run lint` passam sem erros.

---

### P2: analysisSlice — campo awaitingRetrain persistido

**User Story:** Como sistema, quero que `analysisSlice` persista `awaitingRetrainSince`, `lastObservedVersion` e `awaitingForOrderId` no `localStorage` para que o estado de espera de retreinamento sobreviva a reloads.

**Por que P2:** Necessário para AD-045 mas separado por ser uma mudança isolada no slice sem dependência de outros componentes.

**Acceptance Criteria:**

1. WHEN `analysisSlice` é definido THEN SHALL ter campos: `awaitingRetrainSince: number | null`, `lastObservedVersion: string | null`, `awaitingForOrderId: string | null`
2. WHEN `partialize` do persist é configurado THEN SHALL incluir `awaitingRetrainSince`, `lastObservedVersion`, `awaitingForOrderId`
3. WHEN cliente é trocado THEN `awaitingRetrainSince`, `lastObservedVersion` e `awaitingForOrderId` SHALL ser resetados para `null`
4. WHEN `captureRetrained` é chamado THEN `awaitingRetrainSince` SHALL ser resetado para `null`

**Independent Test:** Iniciar checkout → verificar `localStorage` contém `awaitingRetrainSince` → recarregar → `useModelStatus` retoma polling.

---

### P2: Limpeza de edges is_demo no ModelTrainer

**User Story:** Como sistema, quero que `ModelTrainer.train()` não leia nem inclua edges `BOUGHT {is_demo: true}` do Neo4j para garantir que o treino opere apenas sobre dados confirmados.

**Por que P2:** Complementa P1 "ModelTrainer opera somente com Orders confirmadas" — sem a limpeza explícita, pode haver vazamento de sinal legado.

**Acceptance Criteria:**

1. WHEN `ModelTrainer.train()` é chamado THEN SHALL não importar nem chamar `getAllDemoBoughtPairs()`
2. WHEN Neo4j contém edges `BOUGHT {is_demo: true}` de sessões anteriores THEN `syncNeo4j()` SHALL criar edges `BOUGHT` reais sem `is_demo` para os pedidos confirmados, mas não remover as legadas (limpeza offline separada)
3. WHEN `computePrecisionAtK()` filtra o holdout THEN SHALL usar `clientOrderMap` construído somente a partir do retorno de `fetchTrainingData()` (PostgreSQL orders)

**Independent Test:** Inserir edge `is_demo: true` manualmente no Neo4j → treinar → `trainingSamples` idêntico ao esperado somente por `orders` → edge `is_demo` não aparece em métricas.

---

### P3: Proxy Next.js para rotas de Cart

**User Story:** Como frontend, quero rotas proxy em Next.js (`/api/proxy/carts/[clientId]/...`) para todas as operações de carrinho do `api-service`, para que os componentes do frontend possam chamar as APIs de forma consistente com o restante do projeto.

**Por que P3:** Necessário para os componentes de UI mas pode ser feito como ultimo passo — a arquitetura de backend é independente.

**Acceptance Criteria:**

1. WHEN `POST /api/proxy/carts/[clientId]/items` é chamado THEN SHALL fazer proxy para `api-service POST /api/v1/carts/{clientId}/items`
2. WHEN `DELETE /api/proxy/carts/[clientId]/items/[productId]` é chamado THEN SHALL fazer proxy para `api-service DELETE /api/v1/carts/{clientId}/items/{productId}`
3. WHEN `DELETE /api/proxy/carts/[clientId]` é chamado THEN SHALL fazer proxy para `api-service DELETE /api/v1/carts/{clientId}`
4. WHEN `POST /api/proxy/carts/[clientId]/checkout` é chamado THEN SHALL fazer proxy para `api-service POST /api/v1/carts/{clientId}/checkout` com `cache: 'no-store'`
5. WHEN `GET /api/proxy/carts/[clientId]` é chamado THEN SHALL fazer proxy para `api-service GET /api/v1/carts/{clientId}`
6. WHEN `POST /api/proxy/recommend/from-cart` é chamado THEN SHALL fazer proxy para `ai-service POST /api/v1/recommend/from-cart` com `cache: 'no-store'`

**Independent Test:** Chamar cada proxy via `curl` e verificar que a resposta corresponde ao backend direto.

---

## Edge Cases

- WHEN checkout é chamado enquanto job de retrain está ativo THEN `api-service` SHALL retornar `201` normalmente e `ai-service` SHALL enfileirar o novo job (não descartar)
- WHEN `recommendFromCart` recebe `productIds[]` com IDs que não existem no Neo4j THEN `ai-service` SHALL ignorar silenciosamente os IDs sem embedding e continuar com os válidos
- WHEN `currentVersion` é `null` (nenhum modelo treinado ainda) THEN `useModelStatus` SHALL não iniciar polling após checkout — não há versão baseline para comparar; `ModelStatusPanel` SHALL exibir `training` até que `currentVersion` apareça pela primeira vez
- WHEN `MODEL_PROMOTION_TOLERANCE` não está definido no env THEN `VersionedModelStore` SHALL usar default `0.02`
- WHEN `lastTrainingResult` é `'failed'` THEN `currentVersion` e o modelo ativo permanecem inalterados
- WHEN o timeout de 90s expira THEN `ModelStatusPanel` exibe estado `unknown`; ao clicar "Recarregar status" SHALL fazer um fetch manual de `/model/status` e resolver o estado com base no `lastTrainingResult` retornado
- WHEN o usuário faz checkout e imediatamente fecha a aba THEN na próxima abertura `awaitingRetrainSince` no `localStorage` faz o polling retomar; se mais de 90s passaram, estado `unknown` é exibido diretamente

---

## Traceabilidade de Requisitos

| Requirement ID | Story | Fase | Status |
|---|---|---|---|
| CART-01 | P1: Carrinho — adicionar item | Design | Pending |
| CART-02 | P1: Carrinho — remover item | Design | Pending |
| CART-03 | P1: Carrinho — esvaziar | Design | Pending |
| CART-04 | P1: Carrinho — GET carrinho ativo | Design | Pending |
| CART-05 | P1: Carrinho — carrinho vazio retorna estrutura vazia | Design | Pending |
| CART-06 | P1: Carrinho — upsert por productId | Design | Pending |
| CART-07 | P1: Checkout — cria Order + OrderItems | Design | Pending |
| CART-08 | P1: Checkout — esvazia Cart | Design | Pending |
| CART-09 | P1: Checkout — sincroniza Neo4j BOUGHT real | Design | Pending |
| CART-10 | P1: Checkout — retorna `{ orderId, expectedTrainingTriggered: true }` | Design | Pending |
| CART-11 | P1: Checkout — 422 para carrinho vazio | Design | Pending |
| CART-12 | P1: Checkout — fire-and-forget no ai-service | Design | Pending |
| CART-13 | P1: Checkout — ai-service enfileira job retrain | Design | Pending |
| CART-14 | P1: Checkout — serialização de jobs simultâneos | Design | Pending |
| CART-15 | P1: recommendFromCart — meanPooling(orders + cart) | Design | Pending |
| CART-16 | P1: recommendFromCart — productIds vazio = recommend normal | Design | Pending |
| CART-17 | P1: recommendFromCart — ignora productId sem embedding | Design | Pending |
| CART-18 | P1: recommendFromCart — cliente sem pedidos usa só cart | Design | Pending |
| CART-19 | P1: recommendFromCart — formato idêntico ao /recommend | Design | Pending |
| CART-20 | P1: ModelTrainer — sem demoPairs | Design | Pending |
| CART-21 | P1: ModelTrainer — computePrecisionAtK somente orders | Design | Pending |
| CART-22 | P1: ModelTrainer — ignora is_demo Neo4j | Design | Pending |
| CART-23 | P1: ModelTrainer — trainingSamples reflete somente orders | Design | Pending |
| CART-24 | P1: /model/status — currentVersion | Design | Pending |
| CART-25 | P1: /model/status — lastTrainingResult | Design | Pending |
| CART-26 | P1: /model/status — lastTrainingTriggeredBy | Design | Pending |
| CART-27 | P1: /model/status — lastOrderId | Design | Pending |
| CART-28 | P1: /model/status — campos null no primeiro boot | Design | Pending |
| CART-29 | P1: /model/status — triggeredBy checkout/manual | Design | Pending |
| CART-30 | P1: /model/status — promoted atualiza currentVersion | Design | Pending |
| CART-31 | P1: /model/status — rejected mantém currentVersion | Design | Pending |
| CART-32 | P1: /model/status — rejected retorna lastDecision | Design | Pending |
| CART-33 | P1: Promotion gate — banda de tolerância | Design | Pending |
| CART-34 | P1: Promotion gate — promove sempre no primeiro treino | Design | Pending |
| CART-35 | P1: Promotion gate — tolerance=0 é estritamente >= | Design | Pending |
| CART-36 | P1: Promotion gate — MODEL_PROMOTION_TOLERANCE env var | Design | Pending |
| CART-37 | P1: Promotion gate — razão registrada no rejected | Design | Pending |
| CART-38 | P1: ModelStatusPanel — estado idle | Design | Pending |
| CART-39 | P1: ModelStatusPanel — estado training imediato pós-checkout | Design | Pending |
| CART-40 | P1: ModelStatusPanel — estado promoted com delta | Design | Pending |
| CART-41 | P1: ModelStatusPanel — estado rejected com motivo | Design | Pending |
| CART-42 | P1: ModelStatusPanel — estado failed | Design | Pending |
| CART-43 | P1: ModelStatusPanel — botão Retreinar em Avançado colapsável | Design | Pending |
| CART-44 | P1: ModelStatusPanel — sobrevive troca de aba (always-mounted) | Design | Pending |
| CART-45 | P1: useModelStatus — inicia polling após checkout | Design | Pending |
| CART-46 | P1: useModelStatus — para polling ao detectar promoted | Design | Pending |
| CART-47 | P1: useModelStatus — para polling ao detectar rejected | Design | Pending |
| CART-48 | P1: useModelStatus — timeout 90s → estado unknown | Design | Pending |
| CART-49 | P1: useModelStatus — retoma polling após reload | Design | Pending |
| CART-50 | P1: useModelStatus — funciona para manual igual a checkout | Design | Pending |
| CART-51 | P1: RetrainPanel renomeado para ModelStatusPanel | Design | Pending |
| CART-52 | P1: AnalysisPanel importa ModelStatusPanel | Design | Pending |
| CART-53 | P1: useRetrainJob → useModelStatus | Design | Pending |
| CART-54 | P2: analysisSlice — awaitingRetrainSince | Design | Pending |
| CART-55 | P2: analysisSlice — lastObservedVersion | Design | Pending |
| CART-56 | P2: analysisSlice — awaitingForOrderId | Design | Pending |
| CART-57 | P2: analysisSlice — campos no partialize | Design | Pending |
| CART-58 | P2: analysisSlice — reset ao trocar cliente | Design | Pending |
| CART-59 | P2: analysisSlice — captureRetrained reseta awaitingRetrainSince | Design | Pending |
| CART-60 | P2: ModelTrainer — não importa getAllDemoBoughtPairs | Design | Pending |
| CART-61 | P2: ModelTrainer — syncNeo4j cria BOUGHT sem is_demo | Design | Pending |
| CART-62 | P2: ModelTrainer — computePrecisionAtK usa só fetchTrainingData | Design | Pending |
| CART-63 | P3: Proxy /api/proxy/carts/[clientId]/items POST | Design | Pending |
| CART-64 | P3: Proxy /api/proxy/carts/[clientId]/items/[productId] DELETE | Design | Pending |
| CART-65 | P3: Proxy /api/proxy/carts/[clientId] DELETE | Design | Pending |
| CART-66 | P3: Proxy /api/proxy/carts/[clientId]/checkout POST | Design | Pending |
| CART-67 | P3: Proxy /api/proxy/carts/[clientId] GET | Design | Pending |
| CART-68 | P3: Proxy /api/proxy/recommend/from-cart POST | Design | Pending |

**Total:** 68 requisitos | P1: 53 | P2: 9 | P3: 6

---

## Critérios de Sucesso

- [ ] `docker compose up` em ambiente limpo → avaliar seleciona cliente → adiciona produtos ao carrinho → efetiva checkout → `ModelStatusPanel` entra em `training` → após ~9s exibe `promoted` ou `rejected` com informação clara — **sem nenhum comando manual**
- [ ] `GET /model/status` retorna `currentVersion`, `lastTrainingResult`, `lastTrainingTriggeredBy`, `lastOrderId` com valores corretos após checkout
- [ ] `precisionAt5` exibido no `ModelStatusPanel` reflete somente pedidos confirmados (B-001 fechado)
- [ ] Após reload (F5) com retrain em andamento, `ModelStatusPanel` retoma o estado correto via `awaitingRetrainSince` persistido
- [ ] `npm run build` e `npm run lint` sem erros; `./mvnw test` e `npm test` (Vitest) passando
- [ ] Coluna `Pós-Efetivar` na aba Análise é preenchida automaticamente após `promoted`

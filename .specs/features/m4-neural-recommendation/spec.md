# M4 — Neural Recommendation Model — Specification

## Problem Statement

Com os embeddings de produtos gerados no M3, o sistema já consegue busca semântica por similaridade textual. Porém, recomendações eficazes precisam combinar o *que o produto é* (semântica) com *o que clientes similares compraram* (comportamento). O M4 introduz um modelo neural treinado em histórico de compras reais, que aprende padrões latentes de comportamento de clientes B2B. A combinação de score neural + score semântico forma o sistema de recomendação híbrido — o diferencial técnico central do projeto.

## Goals

- [ ] Modelo neural é treinado com sucesso usando embeddings HuggingFace como features de entrada (não one-hot como em `parte05`)
- [ ] `POST /api/v1/recommend` retorna top-N produtos rankeados por score híbrido para qualquer `clientId` válido
- [ ] Score híbrido é demonstravelmente mais relevante que qualquer abordagem isolada (validação qualitativa no README)
- [ ] Treinamento completa sem erro de memória ou timeout em hardware de desenvolvimento (MacBook/Linux com 8GB+ RAM)
- [ ] Todos os endpoints de M4 são consumíveis pelo `api-service` (Spring Boot proxy em M2)

## Out of Scope

| Feature | Reason |
| --- | --- |
| Interface gráfica para recomendações | M5 — frontend separado |
| Métricas formais Precision@K / nDCG | M6 / Deferred Ideas |
| Fine-tuning do modelo HuggingFace | Deferred Idea — requer Python |
| Endpoint de benchmarking comparativo | Deferred Idea |
| Persistência do modelo em banco de dados | Modelo salvo em `/tmp/model` no container — suficiente para MVP |
| Retreinamento automático em novos pedidos | Deferred Idea (Kafka / event-driven) |
| Autenticação nos endpoints | Fora do escopo do MVP |
| Testes unitários e de integração formais | M6 |

---

## User Stories

### P1: Treinamento do Modelo Neural ⭐ MVP

**User Story**: Como engenheiro de ML, quero treinar um modelo neural sobre o histórico de compras de clientes usando embeddings HuggingFace como features, para que o modelo aprenda padrões de comportamento B2B que vão além da similaridade textual.

**Why P1**: É o núcleo do M4. Sem modelo treinado, não há score neural e o endpoint `/recommend` não tem como operar.

**Acceptance Criteria**:

1. WHEN `POST /api/v1/model/train` é chamado THEN sistema SHALL buscar no PostgreSQL (via API Service) todos os clientes, produtos e histórico de pedidos
2. WHEN os dados de treinamento são preparados THEN sistema SHALL construir uma matriz binária `(cliente, produto)` onde `1` = produto foi comprado, `0` = não foi comprado (negative sampling via produtos não comprados)
3. WHEN o perfil de cliente é calculado THEN sistema SHALL representá-lo como a média element-wise dos embeddings dos produtos que ele comprou (`D-007`) — vetor de 384 dims
4. WHEN o produto ainda não tem embedding no Neo4j THEN sistema SHALL logar aviso e pular esse produto no treinamento (não deve falhar o treinamento todo)
5. WHEN o modelo é construído THEN sistema SHALL usar a arquitetura: `[product_embedding(384) + client_profile_vector(384)] → Dense(256, relu) → Dropout(0.3) → Dense(128, relu) → Dropout(0.2) → Dense(64, relu) → Dense(1, sigmoid)`
6. WHEN o treinamento inicia THEN sistema SHALL usar `@tensorflow/tfjs-node`, `optimizer: adam`, `loss: binaryCrossentropy`, `metrics: ['accuracy']`, `epochs: 20`, `batchSize: 32`
7. WHEN cada epoch completa THEN sistema SHALL logar: `Epoch X/20 — loss: Y — accuracy: Z`
8. WHEN o treinamento completa THEN sistema SHALL salvar o modelo em `/tmp/model` no formato TFSavedModel (`model.save('file:///tmp/model')`)
9. WHEN o treinamento completa THEN sistema SHALL retornar `{ status: "trained", epochs: 20, finalLoss: number, finalAccuracy: number, trainingSamples: number, durationMs: number }` com HTTP 200
10. WHEN o modelo já foi treinado anteriormente THEN sistema SHALL sobrescrever o modelo em `/tmp/model` (retreino completo)
11. WHEN `tf.Tensor` é criado durante o treinamento THEN sistema SHALL usar `tf.tidy()` ou `tensor.dispose()` para evitar memory leak (`L-001`)
12. WHEN `POST /api/v1/model/train` é chamado enquanto treinamento já está em andamento THEN sistema SHALL retornar HTTP 409 com `{ error: "Training already in progress" }`

**Independent Test**: `POST /api/v1/model/train` completa sem erro; `GET /api/v1/model/status` retorna `{ status: "trained" }` com métricas de treinamento preenchidas; `/tmp/model` existe no container.

---

### P1: Status do Modelo ⭐ MVP

**User Story**: Como desenvolvedor, quero consultar o status atual do modelo neural (treinado/não treinado, métricas, timestamp), para que eu saiba se o modelo está pronto antes de chamar o endpoint de recomendação.

**Why P1**: Necessário para o endpoint de recomendação verificar pré-condição antes de tentar inferência, e para debugging durante desenvolvimento.

**Acceptance Criteria**:

1. WHEN `GET /api/v1/model/status` é chamado e o modelo ainda não foi treinado THEN sistema SHALL retornar `{ status: "untrained", message: "Call POST /api/v1/model/train to train the model" }` com HTTP 200
2. WHEN `GET /api/v1/model/status` é chamado e o modelo foi treinado THEN sistema SHALL retornar `{ status: "trained", trainedAt: ISO8601, finalLoss: number, finalAccuracy: number, trainingSamples: number }` com HTTP 200
3. WHEN `GET /api/v1/model/status` é chamado enquanto treinamento está em andamento THEN sistema SHALL retornar `{ status: "training", startedAt: ISO8601, progress: "epoch X/20" }` com HTTP 200

**Independent Test**: Antes de treinar → `{ status: "untrained" }`; após `POST /api/v1/model/train` → `{ status: "trained" }` com métricas.

---

### P1: Engine de Recomendação Híbrida ⭐ MVP

**User Story**: Como cliente B2B, quero receber recomendações de produtos rankeados por relevância combinando o que produtos similares representam semanticamente com o que clientes similares compraram, para que eu descubra produtos relevantes que ainda não comprei.

**Why P1**: É o endpoint mais importante do projeto inteiro. Demonstra o sistema híbrido funcionando ponta-a-ponta.

**Acceptance Criteria**:

1. WHEN `POST /api/v1/recommend` é chamado com `{ clientId: string, limit: number }` THEN sistema SHALL validar que o modelo foi treinado (status = "trained") — caso contrário retornar HTTP 503 com `{ error: "Model not trained. Call POST /api/v1/model/train first." }`
2. WHEN o `clientId` não existe no sistema THEN sistema SHALL retornar HTTP 404 com `{ error: "Client not found" }`
3. WHEN o pool de candidatos é construído THEN sistema SHALL incluir apenas produtos: (a) disponíveis no país do cliente (`AVAILABLE_IN`), (b) **não** comprados pelo cliente anteriormente
4. WHEN o pool de candidatos está vazio THEN sistema SHALL retornar `{ clientId, recommendations: [], reason: "No new products available for this client in their country" }` com HTTP 200
5. WHEN o score semântico é calculado THEN sistema SHALL computar a similaridade cosine entre o vetor de perfil do cliente (média dos embeddings dos produtos comprados) e o embedding de cada produto candidato
6. WHEN o score neural é calculado THEN sistema SHALL concatenar `[product_embedding(384) + client_profile_vector(384)]` e executar `model.predict()` para obter o score sigmoid (0–1)
7. WHEN o score final é calculado THEN sistema SHALL aplicar a fórmula `finalScore = NEURAL_WEIGHT * neuralScore + SEMANTIC_WEIGHT * semanticScore` onde os pesos são lidos das env vars `NEURAL_WEIGHT` (default `0.6`) e `SEMANTIC_WEIGHT` (default `0.4`) (`D-005`)
8. WHEN os produtos são rankeados THEN sistema SHALL retornar os top-N produtos ordenados por `finalScore` decrescente
9. WHEN a resposta é construída THEN sistema SHALL retornar para cada produto: `{ id, name, category, price, sku, finalScore, neuralScore, semanticScore, matchReason }` onde `matchReason` é `"neural"` se `neuralScore > semanticScore`, `"semantic"` se contrário, `"hybrid"` se diferença < 0.05
10. WHEN `limit` não é fornecido THEN sistema SHALL usar default `10`
11. WHEN `limit` é maior que 50 THEN sistema SHALL limitar a 50
12. WHEN um produto candidato não tem embedding no Neo4j THEN sistema SHALL pular esse produto sem falhar a requisição — logar aviso `"Product {id} skipped: no embedding"`
13. WHEN `tf.Tensor` é criado durante inferência THEN sistema SHALL usar `tf.tidy()` para liberar memória após cada predict

**Independent Test**: `POST /api/v1/recommend` com `{ "clientId": "client-uuid-válido", "limit": 5 }` retorna array de 5 produtos com `finalScore`, `neuralScore`, `semanticScore` e `matchReason` preenchidos; nenhum produto retornado está no histórico de compras do cliente.

---

### P2: Carregamento de Modelo Persistido no Startup

**User Story**: Como operador, quero que o AI Service carregue automaticamente o modelo salvo ao reiniciar o container, para que as recomendações estejam disponíveis imediatamente após reinício sem precisar retreinar.

**Why P2**: Melhora a experiência de demo significativamente (evita ter que retreinar após `docker compose restart`), mas não bloqueia o MVP — o treinamento manual funciona.

**Acceptance Criteria**:

1. WHEN o AI Service inicia THEN sistema SHALL verificar se `/tmp/model` existe
2. WHEN `/tmp/model` existe no startup THEN sistema SHALL carregar o modelo com `tf.loadLayersModel('file:///tmp/model')` e setar status como `"trained"`
3. WHEN `/tmp/model` não existe no startup THEN sistema SHALL iniciar normalmente com status `"untrained"` — não é erro
4. WHEN o modelo é carregado com sucesso no startup THEN sistema SHALL logar `"Neural model loaded from /tmp/model"`
5. WHEN o carregamento falha (modelo corrompido) THEN sistema SHALL logar aviso e iniciar com status `"untrained"` — não deve impedir o startup

**Independent Test**: Após `POST /api/v1/model/train`, reiniciar o container (`docker compose restart ai-service`) e verificar que `GET /api/v1/model/status` retorna `{ status: "trained" }` sem necessidade de retreinar.

---

### P2: Configuração de Pesos da Fórmula Híbrida via Env Vars

**User Story**: Como engenheiro, quero configurar os pesos do score híbrido via variáveis de ambiente, para que eu possa demonstrar o impacto de diferentes configurações sem alterar o código.

**Why P2**: Permite ajuste fino para o README sem recompilação. Configurável mas não bloqueia MVP com defaults.

**Acceptance Criteria**:

1. WHEN o serviço inicia THEN sistema SHALL ler `NEURAL_WEIGHT` e `SEMANTIC_WEIGHT` do ambiente; default `0.6` e `0.4` respectivamente (`D-005`)
2. WHEN `NEURAL_WEIGHT + SEMANTIC_WEIGHT != 1.0` THEN sistema SHALL logar aviso `"Warning: NEURAL_WEIGHT + SEMANTIC_WEIGHT != 1.0 — scores may not sum to 1"` mas **não** encerrar
3. WHEN os pesos são lidos THEN sistema SHALL logar no startup: `"Hybrid weights: neural=X, semantic=Y"`

**Independent Test**: Iniciar com `NEURAL_WEIGHT=0.8 SEMANTIC_WEIGHT=0.2` e verificar que `finalScore` reflete os novos pesos nos resultados de `/recommend`.

---

## Edge Cases

- WHEN `POST /api/v1/recommend` é chamado para um cliente que nunca fez compras THEN sistema SHALL retornar HTTP 422 com `{ error: "Client has no purchase history. Cannot compute profile vector." }`
- WHEN todos os produtos do país do cliente já foram comprados pelo cliente THEN sistema SHALL retornar `{ recommendations: [], reason: "Client has purchased all available products in their country" }`
- WHEN Neo4j está offline durante `/recommend` THEN sistema SHALL retornar HTTP 503 com `{ error: "Neo4j unavailable" }`
- WHEN `POST /api/v1/model/train` é chamado e o API Service (Spring Boot) está offline THEN sistema SHALL retornar HTTP 503 com `{ error: "API Service unavailable. Cannot fetch training data." }`
- WHEN o pool de candidatos tem menos produtos que `limit` THEN sistema SHALL retornar todos os candidatos disponíveis (sem preencher com nulls)
- WHEN `clientId` é uma string vazia ou inválida THEN sistema SHALL retornar HTTP 400 com `{ error: "clientId is required" }`
- WHEN `limit` é `0` ou negativo THEN sistema SHALL retornar HTTP 400 com `{ error: "limit must be >= 1" }`

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| M4-01 | P1: Treino — busca clientes/produtos/pedidos do API Service | Design | Pending |
| M4-02 | P1: Treino — matriz binária com negative sampling | Design | Pending |
| M4-03 | P1: Treino — perfil de cliente = mean pooling de embeddings (D-007) | Design | Pending |
| M4-04 | P1: Treino — skip produto sem embedding com log de aviso | Design | Pending |
| M4-05 | P1: Treino — arquitetura Dense(256→128→64→1) com Dropout | Design | Pending |
| M4-06 | P1: Treino — adam, binaryCrossentropy, 20 epochs, batch 32 | Design | Pending |
| M4-07 | P1: Treino — log por epoch | Design | Pending |
| M4-08 | P1: Treino — save TFSavedModel em /tmp/model | Design | Pending |
| M4-09 | P1: Treino — retorna métricas finais com HTTP 200 | Design | Pending |
| M4-10 | P1: Treino — sobrescreve modelo anterior | Design | Pending |
| M4-11 | P1: Treino — tf.tidy / dispose para evitar memory leak (L-001) | Design | Pending |
| M4-12 | P1: Treino — HTTP 409 se treinamento já em andamento | Design | Pending |
| M4-13 | P1: Status — untrained antes do treino | Design | Pending |
| M4-14 | P1: Status — trained com métricas após treino | Design | Pending |
| M4-15 | P1: Status — training com progresso durante treino | Design | Pending |
| M4-16 | P1: Recommend — valida modelo treinado (HTTP 503 se não) | Design | Pending |
| M4-17 | P1: Recommend — HTTP 404 para clientId inexistente | Design | Pending |
| M4-18 | P1: Recommend — pool de candidatos: país + não comprado | Design | Pending |
| M4-19 | P1: Recommend — pool vazio retorna 200 com lista vazia | Design | Pending |
| M4-20 | P1: Recommend — semanticScore via cosine similarity | Design | Pending |
| M4-21 | P1: Recommend — neuralScore via model.predict (concat 768 dims) | Design | Pending |
| M4-22 | P1: Recommend — fórmula híbrida com pesos configuráveis (D-005) | Design | Pending |
| M4-23 | P1: Recommend — rank decrescente por finalScore | Design | Pending |
| M4-24 | P1: Recommend — resposta com finalScore, neuralScore, semanticScore, matchReason | Design | Pending |
| M4-25 | P1: Recommend — default limit=10, max 50 | Design | Pending |
| M4-26 | P1: Recommend — skip produto sem embedding com log | Design | Pending |
| M4-27 | P1: Recommend — tf.tidy em predict para liberar memória | Design | Pending |
| M4-28 | P2: Startup — carrega modelo de /tmp/model se existir | Design | Pending |
| M4-29 | P2: Startup — status "untrained" se /tmp/model não existe | Design | Pending |
| M4-30 | P2: Startup — log "Neural model loaded" no carregamento bem-sucedido | Design | Pending |
| M4-31 | P2: Startup — startup normal se modelo corrompido (log aviso) | Design | Pending |
| M4-32 | P2: Env — leitura de NEURAL_WEIGHT e SEMANTIC_WEIGHT com defaults | Design | Pending |
| M4-33 | P2: Env — aviso se pesos não somam 1.0 | Design | Pending |
| M4-34 | P2: Env — log de pesos no startup | Design | Pending |

**Coverage:** 34 total, 34 mapped, 0 unmapped ✓

---

## Success Criteria

- [ ] `POST /api/v1/model/train` completa sem erro; log mostra 20 epochs com loss e accuracy decrescendo/estabilizando
- [ ] `GET /api/v1/model/status` retorna `{ status: "trained" }` com `finalLoss`, `finalAccuracy`, `trainingSamples` preenchidos
- [ ] `POST /api/v1/recommend` com `clientId` válido retorna ≥1 produto com `finalScore`, `neuralScore`, `semanticScore` e `matchReason` preenchidos
- [ ] Nenhum produto retornado por `/recommend` está no histórico de compras do cliente
- [ ] Todos os produtos retornados estão disponíveis no país do cliente
- [ ] `GET /api/v1/recommend/{clientId}` no `api-service` (Spring Boot proxy, M2) delega corretamente para `POST /api/v1/recommend` no AI Service e retorna resposta formatada
- [ ] Container reiniciado carrega modelo automaticamente sem retreino (P2)
- [ ] Sem memory leak: múltiplas chamadas sequenciais a `/recommend` não aumentam consumo de memória do processo Node.js

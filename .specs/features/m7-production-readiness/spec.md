# M7 — Production Readiness Specification

## Problem Statement

Após o M6, o sistema funciona em ambiente controlado, mas falha em três dimensões operacionais críticas para produção:
1. **Produtos novos ficam invisíveis** para RAG e recomendações até intervenção manual (GAP-02).
2. **O modelo neural envelhece silenciosamente** — sem retreinamento automático, as recomendações degradam com o tempo (GAP-01).
3. **Endpoints administrativos estão expostos** sem nenhuma autenticação, tornando o deploy público inseguro (Comitê #10).

Além disso, o treino síncrono bloqueia o evento loop do Fastify (Comitê #6) e não há estratégia de rollback quando um novo treino produz modelo inferior (Comitê #5). Os testes E2E também estão ausentes, impedindo validação regressiva automatizada do frontend.

## Goals

- [ ] Produto cadastrado via `POST /products` fica disponível em busca semântica, RAG e recomendações sem intervenção manual (GAP-02)
- [ ] Modelo neural é retreinado automaticamente toda madrugada sem intervenção humana (GAP-01)
- [ ] `POST /model/train` retorna imediatamente sem bloquear o event loop (Comitê #6)
- [ ] Sistema mantém histórico dos últimos 5 modelos e faz rollback automático se novo treino é inferior (Comitê #5)
- [ ] Endpoints administrativos exigem `X-Admin-Key` válida — deploy público seguro (Comitê #10)
- [ ] Fluxos principais do frontend têm cobertura E2E com Playwright

## Out of Scope

| Feature | Razão |
|---|---|
| Kafka / event-driven (Solução C do GAP-02) | Complexidade desnecessária para MVP; documentado em Future Considerations |
| JWT / OAuth | Header `X-Admin-Key` simples é suficiente para a proteção exigida neste milestone |
| CI/CD pipeline (GitHub Actions) | Deferred para Future Considerations |
| Deploy em cloud | Deferred para Future Considerations |
| Weighted mean pooling por frequência de compra | Melhoria de qualidade pós-MVP (Comitê #3) |
| p-limit no fetchAllPages | Baixa severidade com 20 clientes atuais (Comitê #7) |

---

## User Stories

### P1: Sincronização automática de produtos novos → Neo4j + embeddings (GAP-02) ⭐ MVP

**User Story:** Como operador do sistema, quero que qualquer produto cadastrado via API fique imediatamente disponível em busca semântica, RAG e recomendações, sem precisar chamar manualmente o endpoint de embeddings.

**Why P1:** GAP-02 tem severidade Alta — sem ele, produtos novos são "fantasmas" para toda a camada de IA. É o único gap sem pré-requisitos, devendo ser o primeiro a executar no M7.

**Acceptance Criteria:**

1. WHEN `POST /api/v1/products` é chamado com sucesso no api-service THEN api-service SHALL chamar `POST /api/v1/embeddings/sync-product` no ai-service com o payload do produto
2. WHEN ai-service recebe `POST /api/v1/embeddings/sync-product` THEN ai-service SHALL criar o nó `Product` no Neo4j (se não existir) e gerar seu embedding em menos de 5 segundos
3. WHEN produto é sincronizado THEN `GET /api/v1/search/semantic` com query relacionada ao produto SHALL retornar o produto nos resultados
4. WHEN ai-service está indisponível no momento do `POST /products` THEN api-service SHALL persistir o produto no PostgreSQL normalmente, logar o erro com `productId`, e retornar `201 Created` (não falhar o cadastro)
5. WHEN `POST /api/v1/embeddings/generate` é executado (manualmente ou via cron) THEN SHALL processar também produtos que estão no PostgreSQL mas ainda sem nó no Neo4j ou sem `embedding` (fallback idempotente)
6. WHEN produto já existe no Neo4j com embedding THEN `sync-product` SHALL ser idempotente — sem duplicar nó ou sobrescrever embedding desnecessariamente

**Independent Test:** Chamar `POST /api/v1/products` com um produto novo, aguardar 5s, e verificar via `POST /api/v1/search/semantic` com termo relacionado que o produto aparece nos resultados.

---

### P1: Treino assíncrono — padrão 202 + polling (Comitê #6) ⭐ MVP

**User Story:** Como cliente HTTP (frontend, script, cron), quero que `POST /model/train` retorne imediatamente com um `jobId` para que eu possa monitorar o progresso sem sofrer timeout.

**Why P1:** Pré-requisito obrigatório para GAP-01 (cron diário). Sem treino assíncrono, o cron bloquearia o event loop do Fastify durante o processamento, tornando o serviço irresponsivo.

**Acceptance Criteria:**

1. WHEN `POST /api/v1/model/train` é chamado THEN ai-service SHALL retornar `202 Accepted` com `{ jobId: string, status: "queued", message: string }` em menos de 100ms
2. WHEN `GET /api/v1/model/train/status/{jobId}` é chamado com jobId válido THEN SHALL retornar `{ jobId, status: "queued"|"running"|"complete"|"failed", epoch?: number, totalEpochs?: number, loss?: number, eta?: string }`
3. WHEN treino está em andamento THEN ai-service SHALL continuar respondendo a outros endpoints (`/health`, `/ready`, `/search/semantic`) sem degradação de latência perceptível
4. WHEN `GET /api/v1/model/train/status/{jobId}` é chamado com `jobId` inexistente THEN SHALL retornar `404 Not Found`
5. WHEN treino completa com sucesso THEN status SHALL transitar para `"complete"` e `GET /model/status` SHALL refletir o novo modelo
6. WHEN treino falha com erro THEN status SHALL transitar para `"failed"` com campo `error: string` descrevendo a causa

**Independent Test:** Chamar `POST /model/train` com header admin válido, verificar resposta `202` em < 100ms, fazer polling em `GET /model/train/status/{jobId}` até `"complete"`, confirmar que outros endpoints respondem durante o treino.

---

### P1: Cron diário de retreinamento automático (GAP-01) ⭐ MVP

> **Pré-requisito:** Treino Assíncrono (Comitê #6) — o cron é o *disparador*, o padrão `202 + jobId` é o *mecanismo de execução*. Esta story cobre apenas o agendamento e seus efeitos observáveis; os requisitos de como o treino executa internamente (202, polling, event loop) pertencem à story anterior.

**User Story:** Como operador do sistema, quero que o modelo neural seja retreinado automaticamente toda madrugada para incorporar novos pedidos do dia sem que eu precise intervir manualmente.

**Why P1:** GAP-01 é a raiz da degradação silenciosa do modelo. O `staleDays` implementado no M6 é apenas observabilidade passiva — sem o cron, nenhum mecanismo reage.

**Acceptance Criteria:**

1. WHEN o ai-service inicializa THEN SHALL registrar um cron job `node-cron` com schedule `"0 2 * * *"` (02h00 todo dia)
2. WHEN o cron dispara THEN SHALL enfileirar um job de treino usando o mesmo mecanismo assíncrono da story anterior (sem bloquear a callback do cron com `await`)
3. WHEN o cron dispara e já existe um job de treino com status `"running"` THEN SHALL logar `"Skipping scheduled train: training already in progress"` e não enfileirar novo job
4. WHEN treino enfileirado pelo cron completa com sucesso THEN `staleDays` SHALL ser zerado e `staleWarning` SHALL ser `false` em `GET /model/status`
5. WHEN treino enfileirado pelo cron falha THEN SHALL logar o erro com stack trace sem crashar o processo do ai-service
6. WHEN o cron está registrado THEN `GET /model/status` SHALL expor `{ nextScheduledTraining: string (ISO datetime) }` para observabilidade

**Independent Test:** Alterar temporariamente o schedule para `"* * * * *"` (1 min), aguardar o disparo, verificar nos logs que o job foi enfileirado, e confirmar que `staleDays` zerou em `GET /model/status`.

---

### P1: Model versioning com rollback automático (Comitê #5) ⭐ MVP

**User Story:** Como operador do sistema, quero que um novo treino ruim não substitua um modelo bom em produção, e quero conseguir inspecionar o histórico de modelos com suas métricas.

**Why P1:** Sem versioning, o cron diário pode sobrescrever um modelo bom com um ruim (ex.: após um dia com poucos pedidos ou dados ruidosos). Andar em conjunto com GAP-01 pois ambos tocam `ModelStore`/`ModelTrainer`.

**Acceptance Criteria:**

1. WHEN treino completa THEN modelo SHALL ser salvo em `/tmp/model/model-{ISO8601-timestamp}.json` (ex: `model-2026-04-25T02-00-00.json`)
2. WHEN novo modelo tem `precisionAt5` ≥ `precisionAt5` do modelo atual THEN symlink `/tmp/model/current` SHALL ser atualizado para apontar para o novo modelo
3. WHEN novo modelo tem `precisionAt5` < `precisionAt5` do modelo atual THEN symlink `current` SHALL permanecer inalterado e SHALL ser logado `"Model rejected: new precisionAt5 X < current Y"`
4. WHEN `GET /api/v1/model/status` é chamado THEN SHALL retornar `{ currentModel: string, models: [{ filename, timestamp, precisionAt5, loss, accepted: boolean }] }` com histórico dos últimos 5 modelos
5. WHEN ai-service reinicia THEN SHALL carregar o modelo apontado pelo symlink `current` (ou o mais recente por timestamp se o symlink não existir)
6. WHEN nenhum modelo treinado existe ao inicializar THEN ai-service SHALL inicializar normalmente sem crash, retornando `{ status: "no_model" }` em `GET /model/status`

**Independent Test:** Treinar duas vezes com dados artificialmente diferentes, verificar em `GET /model/status` que o histórico lista dois modelos e que `current` aponta para o de maior `precisionAt5`.

---

### P1: Segurança mínima para deploy público (Comitê #10) ⭐ MVP

**User Story:** Como engenheiro responsável pelo deploy público, quero que endpoints administrativos (treino e geração de embeddings) só possam ser chamados por quem tem a chave de admin, para evitar abuso ou carga não autorizada.

**Why P1:** Sem autenticação, qualquer pessoa que descubra a URL pública pode retreinar o modelo (carga excessiva) ou gerar embeddings desnecessários. Pré-requisito para qualquer exposição pública.

**Acceptance Criteria:**

1. WHEN `POST /api/v1/model/train` é chamado sem header `X-Admin-Key` THEN ai-service SHALL retornar `401 Unauthorized` com body `{ error: "Unauthorized" }`
2. WHEN `POST /api/v1/embeddings/generate` é chamado sem header `X-Admin-Key` THEN ai-service SHALL retornar `401 Unauthorized`
3. WHEN `POST /api/v1/model/train` é chamado com `X-Admin-Key` inválida THEN ai-service SHALL retornar `401 Unauthorized`
4. WHEN `POST /api/v1/model/train` é chamado com `X-Admin-Key` válida (igual à env var `ADMIN_API_KEY`) THEN ai-service SHALL processar normalmente
5. WHEN `ADMIN_API_KEY` não está definida na env THEN ai-service SHALL logar aviso no startup `"ADMIN_API_KEY not set — admin endpoints unprotected"` e retornar `401` para todas as requisições admin
6. WHEN `POST /api/v1/embeddings/sync-product` (chamado internamente pelo api-service) é invocado THEN NÃO SHALL exigir `X-Admin-Key` (endpoint interno, não exposto no README público)
7. WHEN `.env.example` é consultado THEN SHALL conter `ADMIN_API_KEY=` com comentário explicativo

**Independent Test:** Chamar `POST /model/train` sem header → esperar `401`. Chamar com `X-Admin-Key: valor_errado` → esperar `401`. Chamar com chave correta → esperar `202`.

---

### P2: Testes E2E com Playwright

**User Story:** Como engenheiro de QA, quero testes E2E automatizados cobrindo os fluxos principais do frontend para detectar regressões visuais e funcionais sem execução manual.

**Why P2:** Importante para qualidade e portfólio, mas não bloqueia o valor de produção das features P1. Os fluxos P1 (sincronização, treino, segurança) são testados por integração no ai-service.

**Acceptance Criteria:**

1. WHEN `npx playwright test` é executado THEN SHALL executar testes nos fluxos: busca semântica, seleção de cliente + recomendações, e query RAG chat
2. WHEN teste de busca semântica roda THEN SHALL verificar que o campo de busca aceita input e que resultados de produtos são exibidos
3. WHEN teste de recomendações roda THEN SHALL verificar que selecionar um cliente e clicar "Get Recommendations" exibe cards de produtos com scores
4. WHEN teste de RAG chat roda THEN SHALL verificar que enviar uma query retorna uma resposta não-vazia no chat
5. WHEN qualquer teste E2E falha THEN Playwright SHALL salvar screenshot em `e2e/screenshots/` para inspeção
6. WHEN `playwright.config.ts` é consultado THEN SHALL apontar para `baseURL: http://localhost:3000` e ter timeout de 30s por teste

**Independent Test:** Executar `npx playwright test --reporter=list` com todos os serviços rodando e verificar que os 3 fluxos passam.

---

## Edge Cases

- WHEN ai-service está temporariamente fora e `POST /products` chega no api-service THEN api-service SHALL retornar `201` (produto salvo no PostgreSQL) e o produto será sincronizado no próximo ciclo de `embeddings/generate`
- WHEN `POST /api/v1/embeddings/sync-product` é chamado com produto cujo `id` já existe no Neo4j COM embedding THEN SHALL ser idempotente (MERGE + skip se embedding presente)
- WHEN o cron dispara e um treino já está em andamento (jobId com status `"running"`) THEN SHALL logar `"Skipping scheduled train: training already in progress"` e não iniciar segundo treino
- WHEN `/tmp/model/` não existe ao salvar novo modelo THEN ModelStore SHALL criar o diretório automaticamente
- WHEN `precisionAt5` não pode ser calculado (< 5 produtos no catálogo) THEN SHALL usar `loss` como critério de promoção de modelo (loss menor = melhor)
- WHEN `GET /model/train/status/{jobId}` é chamado e o job nunca foi criado THEN SHALL retornar `404 Not Found` (não `200` com status nulo)
- WHEN Playwright não consegue conectar ao `baseURL` THEN testes SHALL falhar com mensagem clara indicando que os serviços precisam estar rodando

---

## Requirement Traceability

| Requirement ID | Story | Descrição resumida | Status |
|---|---|---|---|
| M7-01 | GAP-02 | api-service notifica ai-service após POST /products | Pending |
| M7-02 | GAP-02 | ai-service cria nó Product no Neo4j + gera embedding | Pending |
| M7-03 | GAP-02 | produto aparece em search/semantic após sync | Pending |
| M7-04 | GAP-02 | fallback: ai-service indisponível não bloqueia POST /products | Pending |
| M7-05 | GAP-02 | embeddings/generate processa produtos sem nó Neo4j ou sem embedding | Pending |
| M7-06 | GAP-02 | sync-product é idempotente | Pending |
| M7-07 | Async Train | POST /model/train retorna 202 + jobId em < 100ms | Pending |
| M7-08 | Async Train | GET /model/train/status/{jobId} retorna progresso | Pending |
| M7-09 | Async Train | ai-service responde outros endpoints durante treino | Pending |
| M7-10 | Async Train | 404 para jobId inexistente | Pending |
| M7-11 | Async Train | status transita para "complete" após sucesso | Pending |
| M7-12 | Async Train | status transita para "failed" com campo error | Pending |
| M7-13 | Cron GAP-01 | cron registrado com schedule "0 2 * * *" no startup | Pending |
| M7-14 | Cron GAP-01 | cron enfileira job assíncrono (não bloqueia callback com await) | Pending |
| M7-15 | Cron GAP-01 | skip se treino já em andamento + log | Pending |
| M7-16 | Cron GAP-01 | staleDays zerado + staleWarning false após cron bem-sucedido | Pending |
| M7-17 | Cron GAP-01 | falha no cron loga erro sem crashar o processo | Pending |
| M7-18 | Cron GAP-01 | GET /model/status expõe nextScheduledTraining | Pending |
| M7-18 | Versioning | modelo salvo com timestamp em /tmp/model/ | Pending |
| M7-19 | Versioning | symlink current promovido quando precisionAt5 novo ≥ atual | Pending |
| M7-20 | Versioning | symlink current mantido + log quando precisionAt5 novo < atual | Pending |
| M7-21 | Versioning | GET /model/status retorna histórico dos últimos 5 modelos | Pending |
| M7-22 | Versioning | restart carrega modelo do symlink current | Pending |
| M7-23 | Versioning | inicialização sem modelo não crasha o serviço | Pending |
| M7-24 | Security | POST /model/train sem X-Admin-Key retorna 401 | Pending |
| M7-25 | Security | POST /embeddings/generate sem X-Admin-Key retorna 401 | Pending |
| M7-26 | Security | X-Admin-Key inválida retorna 401 | Pending |
| M7-27 | Security | X-Admin-Key válida processa normalmente | Pending |
| M7-28 | Security | ADMIN_API_KEY ausente loga aviso + bloqueia endpoints admin | Pending |
| M7-29 | Security | sync-product não exige X-Admin-Key (endpoint interno) | Pending |
| M7-30 | Security | .env.example documenta ADMIN_API_KEY | Pending |
| M7-31 | E2E | npx playwright test executa 3 fluxos principais | Pending |
| M7-32 | E2E | teste de busca semântica verifica resultados exibidos | Pending |
| M7-33 | E2E | teste de recomendações verifica cards com scores | Pending |
| M7-34 | E2E | teste de RAG chat verifica resposta não-vazia | Pending |
| M7-35 | E2E | falha salva screenshot em e2e/screenshots/ | Pending |
| M7-36 | E2E | playwright.config.ts aponta para localhost:3000 com timeout 30s | Pending |

**Coverage:** 37 requirements, 0 mapped to tasks, 37 unmapped ⚠️

---

## Success Criteria

- [ ] `POST /products` + 5s delay → produto retorna em `POST /search/semantic` (GAP-02 validado end-to-end)
- [ ] Cron dispara (com schedule de teste), `staleDays` zera, `nextScheduledTraining` exposto em `GET /model/status`
- [ ] `POST /model/train` retorna `202` em < 100ms; polling confirma `"complete"` sem timeout de proxy
- [ ] `GET /model/status` lista histórico de modelos; novo treino inferior não substitui `current`
- [ ] `POST /model/train` sem chave retorna `401`; com chave retorna `202`
- [ ] `npx playwright test` passa todos os 3 fluxos com serviços rodando

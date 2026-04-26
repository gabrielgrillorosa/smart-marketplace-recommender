# Concerns — AI Service
**Serviço:** ai-service (TypeScript / Fastify / Node.js 22)
**Analisado:** 2026-04-26

---

## Alta Severidade

### C-A01: TensorFlow.js backend global — risco de contenção em requests concorrentes
**Arquivo:** `src/services/RecommendationService.ts` (todos os paths que chamam `tf.tidy()`)
**Problema:** `@tensorflow/tfjs-node` usa um único backend C++ global por processo. Duas requisições `POST /recommend` simultâneas executam `model.predict()` concorrentemente no mesmo backend. O comportamento não é documentado como thread-safe pelo TF.js. Em carga baixa (demo) não se manifesta, mas em qualquer teste de carga pode causar resultados incorretos ou crash do processo.
**Fix:** Implementar mutex/semáforo simples (ex: `async-mutex`) no `RecommendationService.recommend()` para serializar execuções de inferência. Ou documentar que o serviço não suporta concorrência de inferência e configurar `--max-old-space-size` + single worker.
**Referência:** STATE.md Deferred Ideas — "Online learning via trainOnBatch rejeitado por thread safety".

### C-A02: Neo4jRepository sem testes — componente mais crítico do sistema
**Arquivo:** `src/repositories/Neo4jRepository.ts` (317 linhas)
**Problema:** O repositório contém todas as queries Cypher, o padrão de vector search, e a lógica de sincronização BOUGHT. Não existe nenhum teste para ele. Queries Cypher com erro de sintaxe, campos renomeados, ou mudanças no schema Neo4j só seriam detectadas em runtime. Para M9, `syncBoughtRelationships()` e os novos métodos de `demo-buy` ficarão igualmente descobertos.
**Fix:** Criar testes de integração com Neo4j Testcontainers ou neo4j-driver `TestContainer` para as queries críticas: `getCandidateProducts`, `getClientPurchasedEmbeddings`, `syncBoughtRelationships`.

---

## Média Severidade

### C-A03: Dois pacotes de transformers coexistindo (@xenova e @huggingface)
**Arquivo:** `package.json`
**Problema:** `@xenova/transformers@2.17.2` (API legada) e `@huggingface/transformers@3.8.1` (API nova) coexistem no `package.json`. O código usa apenas `@xenova`. O pacote `@huggingface/transformers` é a versão oficial successor mas tem API diferente. Isso dobra o tamanho da imagem Docker e cria confusão sobre qual usar.
**Fix:** Remover `@huggingface/transformers` ou migrar completamente para a nova API. Documentar a decisão.

### C-A04: `EmbeddingService` sem testes — dependência crítica para RAG e recomendações
**Arquivo:** `src/services/EmbeddingService.ts`
**Problema:** `embed()` é chamado por `SearchService`, `RAGService` e `ModelTrainer`. Sem testes, mudanças na inicialização ou no output do modelo só são detectadas em runtime. O warm-up de 30-60s torna testes manuais lentos.
**Fix:** Mockar `@xenova/transformers` em testes unitários de `EmbeddingService` para verificar o pipeline sem baixar o modelo.

### C-A05: `console.warn` / `console.log` misturados com `fastify.log`
**Arquivos:** `src/services/RecommendationService.ts` linha 97 (`console.warn`), `src/config/env.ts` (`console.info`, `console.warn`)
**Problema:** `console.*` bypassa o logger estruturado do Fastify (JSON com nível de log). Em produção com log aggregation (Datadog, Loki), essas mensagens aparecem sem estrutura, sem `traceId`, sem nível de log padronizado.
**Fix:** Substituir todos os `console.*` por `this.logger?.warn()` / `this.logger?.info()` onde o logger Fastify está disponível. Para `env.ts`, aceitar como bootstrap log (antes do Fastify existir).

---

## Baixa Severidade

### C-A06: CronScheduler sem testes
**Arquivo:** `src/services/CronScheduler.ts`
**Problema:** O cron de retreinamento diário não tem nenhum teste verificando que `start()` agenda corretamente, que `stop()` cancela, ou que o job é disparado no schedule correto.
**Fix:** Testar com `vi.useFakeTimers()` do Vitest para simular passagem de tempo sem esperar 02h.

### C-A07: Build target é `dist/` mas `start` usa `ts-node` diretamente
**Arquivo:** `package.json` scripts
**Problema:** `start` e `dev` usam `ts-node src/index.ts` — o build `tsc → dist/` existe mas não é o que roda em produção no Dockerfile. Se o Dockerfile usa `ts-node`, o container inclui TypeScript e ts-node como dependência em produção.
**Fix:** Verificar o Dockerfile — se usa `ts-node` em produção, considerar migrar para `node dist/index.js` com build stage no Docker multi-stage para reduzir tamanho da imagem.

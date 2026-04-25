# M6 — Quality & Publication Specification

## Problem Statement

O projeto está funcionalmente completo após M5, mas não está pronto para o portfólio público: faltam testes automatizados que provem confiabilidade, documentação que explique o projeto sem assistência, e polish de engenharia (linting, Dockerfiles otimizados, convenções de contribuição) que sinalize maturidade profissional. Sem M6, um recrutador ou engenheiro que clonar o repositório terá dificuldade para entender, executar e confiar no sistema.

## Goals

- [ ] Suite de testes automatizados cobrindo service layer Java (≥70% coverage) e endpoints críticos do AI Service com mocks
- [ ] README bilíngue (pt-BR / en) auto-suficiente: qualquer engenheiro clona, roda e entende em 10 minutos sem conhecimento prévio do projeto
- [ ] Zero warnings de linting em todos os runtimes (Java/Checkstyle, TypeScript/ESLint, React/ESLint)
- [ ] Dockerfiles multi-stage com imagens mínimas (sem dev dependencies em produção)
- [ ] `CONTRIBUTING.md` mínimo documentando estrutura e convenções do projeto

## Out of Scope

| Feature | Razão |
|---------|-------|
| Deploy em cloud (Railway/Render/Fly.io) | Deferred para pós-MVP (ver Deferred Ideas no STATE.md) |
| Fine-tuning de modelos HuggingFace | Deferred para pós-M4 (ver Deferred Ideas no STATE.md) |
| Kafka async recommendations | Deferred para pós-MVP |
| Precision@K / nDCG endpoint | Deferred para pós-MVP |
| Testes end-to-end (E2E) com Cypress/Playwright | Escopo de portfólio; integração cobre o suficiente |
| CI/CD pipeline (GitHub Actions) | Importante mas não crítico para o objetivo do portfólio; pode ser adicionado em follow-up |
| Cobertura de testes para frontend (Next.js) | Fora do escopo; frontend é demo, não crítico |
| Testes de performance / carga | Deferred; métricas de observabilidade (Actuator) cobrem o necessário |
| Versionamento de modelos com rollback | Deferred — salvar com timestamp pós-MVP (ver Deferred Ideas no STATE.md) |
| Job assíncrono para POST /model/train (202 + polling) | Deferred — síncrono aceitável para MVP com dataset pequeno |
| p-limit concurrency no fetchAllPages | Deferred — sem impacto com 20 clientes atuais |
| Weighted mean pooling por frequência de compra | Deferred — melhoria de modelo pós-MVP |
| Autenticação no endpoint POST /model/train | Deferred — rede interna Docker mitiga o risco no MVP |

---

## User Stories

### P1: Test Suite — API Service (Java) ⭐ MVP

**User Story**: Como engenheiro que avalia o projeto, quero rodar `./mvnw test` e ver testes passando com ≥70% de cobertura nas classes de domínio, para ter confiança de que a lógica de negócio está correta e o código é testável.

**Why P1**: Testes ausentes no service layer são um red flag imediato para qualquer revisão técnica. ≥70% é o threshold mínimo para credibilidade profissional.

**Acceptance Criteria**:

1. WHEN `./mvnw test` é executado THEN todos os testes SHALL passar com exit code 0
2. WHEN JaCoCo report é gerado THEN coverage de `*Service` classes SHALL ser ≥70% (line coverage)
3. WHEN `ProductService`, `ClientService`, `OrderService` e `RecommendationService` são testados THEN cada classe SHALL ter pelo menos 3 unit tests cobrindo: happy path, caso de elemento não encontrado (404) e validação de entrada
4. WHEN `ProductController`, `ClientController` e `OrderController` são testados via MockMvc THEN cada endpoint SHALL ter um integration test verificando status HTTP e estrutura da response
5. WHEN Testcontainers é usado para integration tests THEN a instância PostgreSQL SHALL subir via Docker e os dados SHALL ser limpos entre testes com `@Sql` ou `@Transactional`
6. WHEN um endpoint retorna 404 (recurso não encontrado) THEN o teste SHALL verificar o status code E o body de erro padronizado

**Independent Test**: `./mvnw test` completa em < 3 minutos, zero falhas, JaCoCo report mostra ≥70% em service classes.

---

### P1: Test Suite — AI Service (TypeScript) ⭐ MVP

**User Story**: Como engenheiro que avalia o projeto, quero rodar `npm test` no AI Service e ver testes de integração passando para os endpoints críticos com mocks de Neo4j e do modelo, para validar a lógica de recomendação sem dependências externas.

**Why P1**: Os endpoints `/recommend` e `/rag/query` são o coração do projeto. Testes com mocks isolam a lógica e provam que o código é correto independente da infraestrutura.

**Acceptance Criteria**:

1. WHEN `npm test` é executado no `ai-service/` THEN todos os testes SHALL passar com exit code 0
2. WHEN `POST /api/v1/recommend` é testado THEN o teste SHALL verificar: response status 200, presence de `clientId`, `recommendations` array, e `score`, `matchReason` por item
3. WHEN `POST /api/v1/rag/query` é testado THEN o teste SHALL verificar: response status 200, presence de `answer` string não vazia e `sources` array
4. WHEN `POST /api/v1/search/semantic` é testado THEN o teste SHALL verificar: response status 200, products array com scores numéricos
5. WHEN Neo4j está indisponível (mock retorna erro) THEN `/recommend` SHALL retornar 503 com mensagem de erro estruturada
6. WHEN a score combination logic é testada unitariamente THEN `0.6 * neuralScore + 0.4 * semanticScore` SHALL produzir resultado correto para inputs conhecidos (ex: neural=1.0, semantic=0.5 → final=0.8)
7. WHEN `GET /api/v1/model/status` é testado THEN o teste SHALL verificar presence de `status`, `lastTrained` e `metrics` no response

**Independent Test**: `npm test` no `ai-service/` completa, todos os testes passam, lógica de score combination verificada com valores conhecidos.

---

### P1: README Bilíngue Auto-suficiente ⭐ MVP

**User Story**: Como recrutador ou engenheiro externo, quero um README que me permita entender o projeto, rodá-lo localmente e explorá-lo, tudo em menos de 10 minutos e sem precisar ler o código-fonte.

**Why P1**: O README é a primeira impressão do portfólio. Um README ruim descarta o projeto antes do código ser avaliado.

**Acceptance Criteria**:

1. WHEN o README é aberto THEN SHALL exibir: título do projeto, badge de status, one-liner descrevendo o que o sistema faz e por que é relevante
2. WHEN a seção de quickstart é seguida THEN um engenheiro sem conhecimento prévio SHALL conseguir ter todos os serviços rodando em ≤5 comandos: `git clone` → `cp .env.example .env` → `docker compose up` → abrir browser → sistema funcionando
3. WHEN o README descreve a arquitetura THEN SHALL incluir diagrama (Mermaid ou ASCII) mostrando os 5 serviços, bancos de dados e fluxo de dados entre eles
4. WHEN o README descreve as decisões técnicas THEN SHALL incluir: por que TypeScript para AI Service, por que Java/Spring Boot para API, por que Neo4j como store unificado de grafo + vetores
5. WHEN o README apresenta os endpoints THEN SHALL incluir link para Swagger UI (`http://localhost:8080/swagger-ui.html`) e exemplos de `curl` para os 3 endpoints mais importantes: `/recommend`, `/rag/query`, `/semantic`
6. WHEN a seção de RAG é apresentada THEN SHALL incluir ≥2 exemplo queries em pt-BR e en com expected output (output real capturado de execução, não fabricado)
7. WHEN o README está completo THEN SHALL existir versão em inglês (seções bilíngues ou README-en.md separado)
8. WHEN o `.env.example` é referenciado THEN cada variável SHALL ter comentário explicando seu propósito e valor padrão

**Independent Test**: Pedir a uma pessoa externa para seguir o README do zero; ela consegue rodar o sistema e fazer uma query RAG sem assistência.

---

### P1: Engineering Polish ⭐ MVP

**User Story**: Como engenheiro sênior que revisa o código, quero que o projeto não tenha warnings de linting, use multi-stage Dockerfiles e tenha `.gitignore` correto, para saber que o autor sabe aplicar boas práticas de engenharia além de fazer funcionar.

**Why P1**: Linting warnings e Dockerfiles ingênuos (copiando `node_modules` para produção) são sinais de inexperiência. Esses detalhes afetam a percepção da qualidade geral.

**Acceptance Criteria**:

1. WHEN `./mvnw checkstyle:check` é executado THEN SHALL retornar zero violations (Google Java Style Guide ou Sun Checks)
2. WHEN `npm run lint` é executado em `ai-service/` THEN ESLint SHALL retornar zero warnings e zero errors
3. WHEN `npm run lint` é executado em `frontend/` THEN ESLint SHALL retornar zero warnings e zero errors (Next.js default config)
4. WHEN `docker compose build` é executado THEN cada serviço SHALL usar Dockerfile multi-stage: estágio `builder` com ferramentas de build, estágio `runtime` com apenas artifacts necessários
5. WHEN a imagem do `ai-service` é inspecionada THEN `node_modules` de dev dependencies (ex: `@types/*`, `ts-node`, `vitest`) NÃO SHALL estar presentes na imagem final
6. WHEN a imagem do `api-service` é inspecionada THEN SHALL conter apenas o JAR executável (sem Maven wrapper, sem código fonte)
7. WHEN o `.gitignore` é verificado THEN SHALL cobrir corretamente: `node_modules/`, `.next/`, `target/`, `*.class`, `*.env` (exceto `.env.example`), `tmp/`, arquivos de IDE (`.idea/`, `.vscode/` com exceções de `settings.json` compartilhável)
8. WHEN `CONTRIBUTING.md` é lido THEN SHALL descrever: estrutura do monorepo, como rodar cada serviço individualmente para desenvolvimento, como rodar os testes, convenção de commits (Conventional Commits)

**Independent Test**: `./mvnw checkstyle:check && npm run lint` (em ai-service e frontend) passam sem output de warning; `docker images` mostra imagens compactas; `.gitignore` verificado manualmente.

---

### P2: Diagrama de Arquitetura no README

**User Story**: Como engenheiro que avalia o projeto, quero um diagrama visual claro da arquitetura, para entender o sistema em 30 segundos sem ler código.

**Why P2**: Complementa o README. Não é bloqueante para o quickstart, mas aumenta significativamente a impressão de maturidade do projeto.

**Acceptance Criteria**:

1. WHEN o diagrama é exibido THEN SHALL mostrar todos os 5 serviços (`api-service`, `ai-service`, `frontend`, `postgres`, `neo4j`) com suas responsabilidades
2. WHEN o diagrama mostra fluxo de dados THEN SHALL identificar os 3 fluxos principais: (a) recomendação híbrida, (b) busca semântica, (c) RAG query
3. WHEN o diagrama é renderizado no GitHub THEN SHALL ser legível sem zoom (Mermaid em Markdown ou SVG embutido)

**Independent Test**: Mostrar o diagrama para alguém sem contexto; essa pessoa consegue descrever o sistema corretamente em 30 segundos.

---

### P2: Sample RAG Queries com Output Real

**User Story**: Como recrutador ou engenheiro externo, quero ver exemplos de queries RAG com respostas reais do sistema no README, para entender o que o sistema faz sem precisar rodá-lo.

**Why P2**: Demonstra concretamente a capacidade do sistema. Essencial para quem não vai executar o projeto localmente.

**Acceptance Criteria**:

1. WHEN os exemplos de RAG são exibidos THEN SHALL incluir ≥2 queries em pt-BR e ≥1 em inglês
2. WHEN o output é apresentado THEN SHALL ser output real capturado de uma execução do sistema (não fabricado)
3. WHEN o contexto recuperado é exibido THEN SHALL mostrar os `sources` (chunks de produtos usados como contexto) alongside a resposta

**Independent Test**: Executar as mesmas queries no sistema rodando; respostas SHALL ser semanticamente equivalentes às do README (podem variar em wording por temperatura do LLM).

---

### P1: Persistência do Modelo Neural ⭐ MVP
_Achado crítico #4 do Comitê de Arquitetura — sem isso o sistema perde o modelo treinado a cada restart_

**User Story**: Como operador do sistema, quero que o modelo neural treinado sobreviva a restarts do container, para não precisar retreinar manualmente após cada deploy ou crash.

**Why P1**: O `ModelStore` mantém o modelo em RAM. `/tmp` é volátil sem volume Docker. Qualquer `docker compose restart` reinicia o serviço em estado `untrained`, quebrando recomendações silenciosamente em produção.

**Acceptance Criteria**:

1. WHEN `docker-compose.yml` é verificado THEN SHALL existir volume nomeado `ai-model-data` montado em `/tmp/model` no serviço `ai-service`
2. WHEN `POST /model/train` completa com sucesso THEN o modelo SHALL ser salvo em `/tmp/model/model.json` (comportamento já existente no `ModelTrainer`)
3. WHEN o container `ai-service` é reiniciado THEN ao startup o serviço SHALL tentar carregar o modelo de `/tmp/model/model.json` automaticamente (comportamento já existente no `index.ts`)
4. WHEN o modelo é carregado com sucesso no startup THEN `GET /model/status` SHALL retornar `status: "trained"` sem necessidade de novo treino
5. WHEN o volume `ai-model-data` não contém modelo (primeira vez) THEN o startup SHALL continuar normalmente com `status: "untrained"` sem erro

**Independent Test**: `docker compose up -d && POST /model/train` → `docker compose restart ai-service` → `GET /model/status` retorna `trained`.

---

### P1: Observabilidade do Ciclo de Treino ⭐ MVP
_Achado crítico #8 do Comitê de Arquitetura — sem isso o modelo se degrada silenciosamente em produção_

**User Story**: Como operador do sistema, quero saber há quantos dias o modelo não é retreinado e receber um aviso quando estiver desatualizado, para garantir que as recomendações reflitam dados recentes.

**Why P1**: Em produção ninguém lembra de chamar `POST /model/train`. O modelo fica com dados de meses atrás, as recomendações pioram silenciosamente, e nenhum sinal indica o problema.

**Acceptance Criteria**:

1. WHEN `GET /model/status` é chamado THEN a resposta SHALL incluir o campo `staleDays: number` (dias desde o último treino; `null` se nunca treinado)
2. WHEN `staleDays >= 7` THEN a resposta SHALL incluir `staleWarning: "Model trained N days ago — consider retraining"`
3. WHEN o README documenta o ciclo de retreinamento THEN SHALL incluir instrução explícita: como e quando chamar `POST /model/train`, e o que significa `staleDays`
4. WHEN o `.env.example` é verificado THEN SHALL existir comentário explicando que retreinamento manual é necessário após acúmulo de novos pedidos

**Independent Test**: Treinar modelo → avançar clock ou aguardar → `GET /model/status` exibe `staleDays > 0` e warning quando `>= 7`.

---

### P1: Sincronização Neo4j com Novos Pedidos ⭐ MVP
_Achado crítico #1 do Comitê de Arquitetura — inconsistência entre dados de treino e inferência_

**User Story**: Como operador do sistema, quero que o Neo4j reflita os pedidos reais do PostgreSQL antes do retreinamento, para que o perfil do cliente na inferência use dados atualizados.

**Why P1**: O `ModelTrainer` lê do PostgreSQL (dados reais), mas o `RecommendationService` lê do Neo4j (dados congelados no seed). Um cliente que comprou 10 novos produtos continua tendo seu perfil calculado com os produtos do seed — as recomendações ignoram o comportamento recente.

**Acceptance Criteria**:

1. WHEN `POST /model/train` é chamado THEN antes de buscar dados de treino SHALL executar sincronização dos relacionamentos `(:Client)-[:BOUGHT]->(:Product)` no Neo4j com base nos pedidos atuais do PostgreSQL
2. WHEN a sincronização ocorre THEN SHALL usar `MERGE` (não `CREATE`) para evitar duplicatas — idempotente
3. WHEN um novo pedido existe no PostgreSQL mas o produto não tem embedding no Neo4j THEN o item SHALL ser ignorado na sincronização com log de warning
4. WHEN a sincronização completa THEN o log SHALL reportar: `[Sync] N relationships created, M already existed, K skipped (no embedding)`
5. WHEN `GET /model/status` é chamado após treino com sync THEN a resposta SHALL incluir `syncedAt` com o timestamp da última sincronização

**Independent Test**: Criar pedido novo via `POST /api/v1/orders` → `POST /model/train` → verificar no Neo4j Browser que novo `:BOUGHT` edge existe → `POST /recommend` para aquele cliente não recomenda o produto recém-comprado.

---

### P2: Métricas de Qualidade das Recomendações
_Achado médio #9 do Comitê de Arquitetura — observabilidade de qualidade_

**User Story**: Como engenheiro que opera o sistema, quero logs estruturados de cada chamada ao `/recommend` com métricas de qualidade, para poder analisar a distribuição de scores e detectar degradação do modelo.

**Why P2**: Sem métricas, é impossível saber se o modelo está performando bem ou se `matchReason: "semantic"` domina (indicando que o neural não está contribuindo).

**Acceptance Criteria**:

1. WHEN `POST /recommend` é chamado THEN o log estruturado SHALL incluir: `clientId`, `country`, `resultsCount`, `avgFinalScore`, `matchReasonDistribution` (contagem de neural/semantic/hybrid)
2. WHEN nenhum resultado é retornado THEN o log SHALL incluir o motivo (`no_history`, `no_candidates`, `model_untrained`)
3. WHEN o log é emitido THEN SHALL usar o logger Fastify existente (nível `info`) para manter consistência com os demais logs do serviço

**Independent Test**: Chamar `/recommend` → verificar logs do container com `docker logs ai-service` → confirmar presença dos campos exigidos em JSON estruturado.

---

### P2: Precision@K como Métrica de Avaliação do Modelo
_Achado médio #2 do Comitê de Arquitetura — accuracy não é métrica válida com class imbalance_

**User Story**: Como Engenheiro de IA, quero que o relatório de treino inclua Precision@K além de accuracy, para avaliar corretamente a qualidade do modelo com o dataset desbalanceado (85% label 0).

**Why P2**: Com 85% de amostras negativas, accuracy de 84% pode simplesmente indicar que o modelo prevê sempre 0. Precision@K mede o que importa: dos K produtos recomendados, quantos o cliente realmente compraria.

**Acceptance Criteria**:

1. WHEN `POST /model/train` completa THEN a resposta SHALL incluir `precisionAt5: number` (fração dos top-5 produtos previstos que o cliente de fato comprou, média sobre todos os clientes de validação)
2. WHEN `GET /model/status` é consultado THEN SHALL incluir `precisionAt5` no campo `metrics` junto com `finalAccuracy` e `finalLoss`
3. WHEN o README documenta as métricas THEN SHALL explicar por que Precision@K é mais relevante que accuracy para datasets desbalanceados

**Independent Test**: `POST /model/train` → response inclui `precisionAt5` numérico → `GET /model/status` exibe o valor em `metrics`.

---



- WHEN `./mvnw test` falha por falta de Docker (Testcontainers) THEN o erro SHALL ser claro no README com instrução de prerequisito
- WHEN o modelo não está treinado e `/recommend` é chamado nos testes THEN os mocks SHALL retornar um estado `untrained` com neuralScore=0 e o teste SHALL validar fallback para semantic only
- WHEN a variável `OPENROUTER_API_KEY` está ausente no `.env` THEN os testes do RAG SHALL usar mock do LLM (sem chamar API real) para não exigir chave em CI
- WHEN o Dockerfile multi-stage é buildado em ambiente sem cache THEN o build SHALL completar em tempo razoável (< 10 min para cold build)
- WHEN o `.env.example` é copiado para `.env` sem alterações THEN `docker compose up` SHALL subir com valores default funcionais para desenvolvimento local (exceto `OPENROUTER_API_KEY` que requer chave real)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|----------------|-------|-------|--------|
| M6-01 | P1: Test Suite Java — `./mvnw test` passa | Design | Pending |
| M6-02 | P1: Test Suite Java — JaCoCo ≥70% em service classes | Design | Pending |
| M6-03 | P1: Test Suite Java — unit tests por classe de serviço (happy path, 404, validação) | Design | Pending |
| M6-04 | P1: Test Suite Java — MockMvc integration tests por controller | Design | Pending |
| M6-05 | P1: Test Suite Java — Testcontainers PostgreSQL com isolamento entre testes | Design | Pending |
| M6-06 | P1: Test Suite Java — verificação de body de erro em respostas 404 | Design | Pending |
| M6-07 | P1: Test Suite TS — `npm test` passa | Design | Pending |
| M6-08 | P1: Test Suite TS — `/recommend` testado: status 200, shape do response | Design | Pending |
| M6-09 | P1: Test Suite TS — `/rag/query` testado: status 200, answer + sources | Design | Pending |
| M6-10 | P1: Test Suite TS — `/semantic` testado: status 200, products com scores | Design | Pending |
| M6-11 | P1: Test Suite TS — `/recommend` retorna 503 quando Neo4j indisponível | Design | Pending |
| M6-12 | P1: Test Suite TS — score combination logic verificada unitariamente | Design | Pending |
| M6-13 | P1: Test Suite TS — `/model/status` testado: presence de status, lastTrained, metrics | Design | Pending |
| M6-14 | P1: README — título, badge, one-liner | Design | Pending |
| M6-15 | P1: README — quickstart em ≤5 comandos | Design | Pending |
| M6-16 | P1: README — diagrama de arquitetura (Mermaid ou ASCII) | Design | Pending |
| M6-17 | P1: README — seção de decisões técnicas (TypeScript, Java, Neo4j) | Design | Pending |
| M6-18 | P1: README — endpoints documentados com curl examples + link Swagger | Design | Pending |
| M6-19 | P1: README — exemplos RAG em pt-BR e en com output real | Design | Pending |
| M6-20 | P1: README — versão em inglês (bilíngue ou README-en.md) | Design | Pending |
| M6-21 | P1: README — `.env.example` com comentários por variável | Design | Pending |
| M6-22 | P1: Engineering Polish — Checkstyle zero violations (Java) | Design | Pending |
| M6-23 | P1: Engineering Polish — ESLint zero warnings (ai-service) | Design | Pending |
| M6-24 | P1: Engineering Polish — ESLint zero warnings (frontend) | Design | Pending |
| M6-25 | P1: Engineering Polish — Dockerfile multi-stage api-service | Design | Pending |
| M6-26 | P1: Engineering Polish — Dockerfile multi-stage ai-service (sem dev deps) | Design | Pending |
| M6-27 | P1: Engineering Polish — Dockerfile multi-stage frontend | Design | Pending |
| M6-28 | P1: Engineering Polish — `.gitignore` completo (Node, Java, Next.js, IDE) | Design | Pending |
| M6-29 | P1: Engineering Polish — `CONTRIBUTING.md` com estrutura, dev setup, testes, commits | Design | Pending |
| M6-30 | P2: Diagrama mostrando 5 serviços e responsabilidades | - | Pending |
| M6-31 | P2: Diagrama mostrando 3 fluxos principais de dados | - | Pending |
| M6-32 | P2: Diagrama legível no GitHub sem zoom | - | Pending |
| M6-33 | P2: Sample RAG — ≥2 queries pt-BR + ≥1 en | - | Pending |
| M6-34 | P2: Sample RAG — output real capturado (não fabricado) | - | Pending |
| M6-35 | P2: Sample RAG — sources exibidos alongside resposta | - | Pending |
| M6-36 | P1: Persistência — volume `ai-model-data` declarado no docker-compose.yml | Design | Pending |
| M6-37 | P1: Persistência — modelo salvo em `/tmp/model` após treino (já implementado) | Design | Pending |
| M6-38 | P1: Persistência — modelo carregado no startup se volume existir (já implementado) | Design | Pending |
| M6-39 | P1: Persistência — `GET /model/status` retorna `trained` após restart com volume | Design | Pending |
| M6-40 | P1: Persistência — startup sem volume continua normalmente com `untrained` | Design | Pending |
| M6-41 | P1: Observabilidade — `GET /model/status` inclui campo `staleDays` | Design | Pending |
| M6-42 | P1: Observabilidade — `staleWarning` quando `staleDays >= 7` | Design | Pending |
| M6-43 | P1: Observabilidade — README documenta ciclo de retreinamento | Design | Pending |
| M6-44 | P1: Observabilidade — `.env.example` comenta necessidade de retreino manual | Design | Pending |
| M6-45 | P1: Sync Neo4j — `POST /model/train` sincroniza `:BOUGHT` edges antes do treino | Design | Pending |
| M6-46 | P1: Sync Neo4j — sincronização usa MERGE (idempotente) | Design | Pending |
| M6-47 | P1: Sync Neo4j — produtos sem embedding são ignorados com warning | Design | Pending |
| M6-48 | P1: Sync Neo4j — log reporta created/existed/skipped após sync | Design | Pending |
| M6-49 | P1: Sync Neo4j — `GET /model/status` inclui campo `syncedAt` | Design | Pending |
| M6-50 | P2: Métricas — log estruturado de `/recommend` com clientId, avgScore, matchReasonDistribution | - | Pending |
| M6-51 | P2: Métricas — log inclui motivo quando sem resultados | - | Pending |
| M6-52 | P2: Métricas — usa logger Fastify existente (nível info) | - | Pending |
| M6-53 | P2: Precision@K — `POST /model/train` inclui `precisionAt5` na resposta | Design | Pending |
| M6-54 | P2: Precision@K — `GET /model/status` inclui `precisionAt5` em `metrics` | Design | Pending |
| M6-55 | P2: Precision@K — README explica por que Precision@K > accuracy para datasets desbalanceados | - | Pending |

**Coverage:** 55 requirements, 0 mapeados para tasks, 55 unmapped ⚠️

---

## Success Criteria

- [ ] `./mvnw test` passa com JaCoCo ≥70% coverage em service classes (M6-01, M6-02)
- [ ] `npm test` no ai-service passa com todos os endpoints críticos cobertos (M6-07)
- [ ] `./mvnw checkstyle:check` + `npm run lint` (ai-service e frontend) passam com zero warnings (M6-22, M6-23, M6-24)
- [ ] `docker compose build` produz imagens multi-stage sem dev dependencies (M6-25, M6-26, M6-27)
- [ ] Um engenheiro sem contexto prévio consegue clonar, rodar e usar o sistema seguindo apenas o README em ≤10 minutos (M6-15)
- [ ] README bilíngue com diagrama, decisões técnicas e exemplos reais de RAG (M6-14..M6-21, M6-30..M6-35)
- [ ] `CONTRIBUTING.md` completo com convenções e dev setup (M6-29)
- [ ] Volume `ai-model-data` declarado — modelo sobrevive a `docker compose restart` (M6-36..M6-40)
- [ ] `GET /model/status` inclui `staleDays` e `staleWarning` quando modelo desatualizado (M6-41, M6-42)
- [ ] `POST /model/train` sincroniza `:BOUGHT` edges do Neo4j com PostgreSQL antes do treino (M6-45..M6-49)
- [ ] `POST /model/train` inclui `precisionAt5` na resposta; `GET /model/status` expõe em `metrics` (M6-53, M6-54)
- [ ] Logs estruturados de `/recommend` com métricas de qualidade observáveis (M6-50..M6-52)

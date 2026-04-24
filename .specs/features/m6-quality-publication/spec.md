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

## Edge Cases

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

**Coverage:** 35 requirements, 0 mapeados para tasks, 35 unmapped ⚠️

---

## Success Criteria

- [ ] `./mvnw test` passa com JaCoCo ≥70% coverage em service classes (M6-01, M6-02)
- [ ] `npm test` no ai-service passa com todos os endpoints críticos cobertos (M6-07)
- [ ] `./mvnw checkstyle:check` + `npm run lint` (ai-service e frontend) passam com zero warnings (M6-22, M6-23, M6-24)
- [ ] `docker compose build` produz imagens multi-stage sem dev dependencies (M6-25, M6-26, M6-27)
- [ ] Um engenheiro sem contexto prévio consegue clonar, rodar e usar o sistema seguindo apenas o README em ≤10 minutos (M6-15)
- [ ] README bilíngue com diagrama, decisões técnicas e exemplos reais de RAG (M6-14..M6-21, M6-30..M6-35)
- [ ] `CONTRIBUTING.md` completo com convenções e dev setup (M6-29)

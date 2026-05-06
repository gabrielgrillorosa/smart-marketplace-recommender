# M24 — Tarefas de implementação (hardening relacional e query performance do `api-service`)

**Milestone:** **M24**  
**RFC:** [rfc.md](./rfc.md)  
**Spec:** [spec.md](./spec.md)  
**Design:** [design.md](./design.md)  
**Testing api-service:** [.specs/codebase/api-service/TESTING.md](../../codebase/api-service/TESTING.md)

**Status:** Verified (2026-05-05, `api-service` `mvn verify` verde)  
**Ordem canónica:** T24-1 → T24-2 → T24-3 → T24-4 → T24-5 → T24-6

---

## Plano de execução

### Fase 1 — Leitura relacional por caso de uso

```text
T24-1 ─► T24-2 ─► T24-3
```

### Fase 2 — Schema e fallback previsíveis

```text
T24-3 ─► T24-4 ─► T24-5
```

### Fase 3 — Validação e fecho documental

```text
T24-5 ─► T24-6
```

**Regra:** a sequência é intencionalmente linear porque `ClientApplicationService.java` concentra dois fluxos afectados e a validação final depende de todas as rotas e queries críticas estarem estabilizadas.

---

## Validação TLC (pré-aprovação)

### Granularity check

| Task | Âmbito | Status |
|------|--------|--------|
| T24-1 | Catálogo sem N+1 com paginação por ids + hidratação em lote | ✅ |
| T24-2 | Listagem de clientes via projection DTO | ✅ |
| T24-3 | Listagem de pedidos via ids paginados + reagrupamento em memória | ✅ |
| T24-4 | Índices explícitos em `orders` / `product_countries` + fallback relacional | ✅ |
| T24-5 | Harness de validação com query count e `EXPLAIN ANALYZE` | ✅ |
| T24-6 | Build gate e sincronização documental do milestone | ✅ |

### Diagram ↔ `Depends on` cross-check

| Task | Depends on (corpo) | Diagrama | Match |
|------|---------------------|----------|-------|
| T24-1 | — | entrada | ✅ |
| T24-2 | T24-1 | após T24-1 | ✅ |
| T24-3 | T24-2 | após T24-2 | ✅ |
| T24-4 | T24-3 | após T24-3 | ✅ |
| T24-5 | T24-4 | após T24-4 | ✅ |
| T24-6 | T24-5 | após T24-5 | ✅ |

### Test co-location ([TESTING.md](../../codebase/api-service/TESTING.md))

| Task | Camada / ficheiros | Matrix / convenção | Tests no corpo |
|------|---------------------|--------------------|----------------|
| T24-1 | `src/main/java/com/smartmarketplace/service/ProductApplicationService.java`, `src/main/java/com/smartmarketplace/repository/ProductRepository.java` | Novo fluxo de leitura de catálogo -> unit co-localizado + IT do controller | unit + it |
| T24-2 | `src/main/java/com/smartmarketplace/service/ClientApplicationService.java`, `src/main/java/com/smartmarketplace/repository/ClientRepository.java` | Projection de listagem -> unit co-localizado + IT do controller | unit + it |
| T24-3 | `src/main/java/com/smartmarketplace/service/ClientApplicationService.java`, `src/main/java/com/smartmarketplace/repository/OrderRepository.java` | Fluxo de pedidos -> unit co-localizado + IT do controller | unit + it |
| T24-4 | `src/main/java/com/smartmarketplace/repository/FallbackRecommendationQuery.java`, `infra/postgres/init.sql` | Schema + JDBC fallback | unit + it |
| T24-5 | `src/test/java/com/smartmarketplace/controller/BaseIntegrationTest.java`, novos ITs de query count | Harness de integração/Testcontainers | it |
| T24-6 | `ROADMAP.md`, `STATE.md` | Documento de projecto / fecho de milestone | build |

---

## Task breakdown

### T24-1 — Catálogo sem N+1 com paginação por ids e hidratação em lote

**What:** Trocar a leitura "entity-first" de `listProducts()` por uma estratégia em duas etapas: paginação estável dos ids/resultados base, seguida de hidratação em lote com `findAllByIdWithCountries(...)`, preservando filtros, paginação e a ordem contratual do catálogo.

**Where:** `api-service/src/main/java/com/smartmarketplace/service/ProductApplicationService.java`, `api-service/src/main/java/com/smartmarketplace/repository/ProductRepository.java`, `api-service/src/test/java/com/smartmarketplace/service/ProductApplicationServiceTest.java`, `api-service/src/test/java/com/smartmarketplace/controller/ProductControllerIT.java`

**Depends on:** —  
**Reuses:** `ProductSpecifications`, `ProductSummaryDTO`, `findAllByIdWithCountries(...)`, `getProduct(...)`

**Requirement:** M24-01, M24-02, M24-03, M24-04  
**Tools:** MCP: NONE · Skill: tlc-spec-driven

**Done when:**

- [ ] `listProducts()` deixa de mapear `supplier` e `countries` a partir de entidades lazy carregadas na página original.
- [ ] A paginação continua correcta e a ordem dos itens permanece estável.
- [ ] Os filtros `category`, `country`, `supplier` e `search` mantêm a semântica actual.
- [ ] `getProduct()` continua inalterado e a cobertura existente permanece verde.
- [ ] Gate: `cd api-service && ./mvnw -Dtest=ProductApplicationServiceTest test` exit 0.

**Tests:** unit  
**Gate:** quick — `cd api-service && ./mvnw -Dtest=ProductApplicationServiceTest test`
**Commit:** `feat(api-service): harden product listing against N+1 (T24-1)`

---

### T24-2 — Listagem de clientes via projection DTO

**What:** Substituir o carregamento `findAll(PageRequest)` + mapeamento lazy por uma query de projection que devolve directamente `ClientSummaryDTO`, mantendo o contrato público da listagem e deixando o detalhe `getClient()` intacto.

**Where:** `api-service/src/main/java/com/smartmarketplace/service/ClientApplicationService.java`, `api-service/src/main/java/com/smartmarketplace/repository/ClientRepository.java`, `api-service/src/test/java/com/smartmarketplace/service/ClientApplicationServiceTest.java`, `api-service/src/test/java/com/smartmarketplace/controller/ClientControllerIT.java`

**Depends on:** T24-1  
**Reuses:** `ClientSummaryDTO`, `getClient(...)`, `findByIdWithCountry(...)`

**Requirement:** M24-05, M24-08  
**Tools:** MCP: NONE · Skill: tlc-spec-driven

**Done when:**

- [ ] `listClients()` passa a devolver `Page<ClientSummaryDTO>` sem navegação lazy por cliente.
- [ ] O `countryCode` continua correcto e o shape da resposta não muda.
- [ ] `getClient()` continua a devolver o resumo de compras correcto com a query actual.
- [ ] A listagem continua a funcionar com página vazia e com paginação normal.
- [ ] Gate: `cd api-service && ./mvnw -Dtest=ClientApplicationServiceTest test` exit 0.

**Tests:** unit  
**Gate:** quick — `cd api-service && ./mvnw -Dtest=ClientApplicationServiceTest test`
**Commit:** `feat(api-service): project client listings directly to DTOs (T24-2)`

---

### T24-3 — Listagem de pedidos via ids paginados + reagrupamento em memória

**What:** Reescrever `listClientOrders()` para primeiro paginar ids de `Order` por `clientId` e `orderDate DESC`, depois hidratar `items` e `items.product` em lote e reconstituir a ordem original sem navegação lazy em cascata.

**Where:** `api-service/src/main/java/com/smartmarketplace/service/ClientApplicationService.java`, `api-service/src/main/java/com/smartmarketplace/repository/OrderRepository.java`, `api-service/src/test/java/com/smartmarketplace/service/ClientApplicationServiceTest.java`, `api-service/src/test/java/com/smartmarketplace/controller/OrderControllerIT.java`

**Depends on:** T24-2  
**Reuses:** `OrderDTO`, `OrderItemDTO`, `findPurchaseSummaryByClientId(...)`, `ResourceNotFoundException`

**Requirement:** M24-06, M24-07  
**Tools:** MCP: NONE · Skill: tlc-spec-driven

**Done when:**

- [ ] `listClientOrders()` deixa de percorrer `orders -> items -> product` a partir da página já carregada.
- [ ] A paginação por `orderDate DESC` continua estável e o contrato da resposta mantém-se inalterado.
- [ ] O `clientId` inexistente continua a lançar `ResourceNotFoundException`.
- [ ] A montagem de `OrderDTO` preserva a ordem original dos pedidos e dos itens.
- [ ] Gate: `cd api-service && ./mvnw -Dtest=ClientApplicationServiceTest test` exit 0.

**Tests:** unit  
**Gate:** quick — `cd api-service && ./mvnw -Dtest=ClientApplicationServiceTest test`
**Commit:** `feat(api-service): batch-load client orders without lazy cascades (T24-3)`

---

### T24-4 — Índices explícitos e fallback relacional previsível

**What:** Endurecer o schema em `init.sql` com os índices de suporte aos padrões reais de acesso e revisar o `FallbackRecommendationQuery` apenas na medida necessária para manter a semântica funcional estável e o custo previsível, sem reescrever a query para uma nova arquitectura.

**Where:** `infra/postgres/init.sql`, `api-service/src/main/java/com/smartmarketplace/repository/FallbackRecommendationQuery.java`, `api-service/src/test/java/com/smartmarketplace/service/RecommendationServiceTest.java`

**Depends on:** T24-3  
**Reuses:** `topSelling(...)`, `topSellingForCart(...)`, SQL actual, `RecommendationServiceTest`

**Requirement:** M24-09, M24-10, M24-11, M24-12  
**Tools:** MCP: NONE · Skill: tlc-spec-driven

**Done when:**

- [ ] `orders(client_id, order_date desc)` ou equivalente justificável fica presente no schema.
- [ ] `product_countries(country_code, product_id)` ou equivalente justificável fica presente no schema.
- [ ] `topSelling(...)` mantém semântica de país e exclusão de produtos já comprados.
- [ ] `topSellingForCart(...)` mantém exclusão dos itens do carrinho e priorização por categoria.
- [ ] A alteração continua limitada a hardening relacional, sem expandir o domínio funcional.
- [ ] Gate: revisão SQL + testes de serviço relacionados passam.

**Tests:** unit + it  
**Gate:** full — `cd api-service && ./mvnw verify`
**Commit:** `feat(api-service): harden fallback schema and recommendation queries (T24-4)`

---

### T24-5 — Harness de validação com query count e `EXPLAIN ANALYZE`

**What:** Adicionar uma validação repetível para as rotas afectadas e para o fallback crítico, medindo contagem de statements nas listagens e guardando evidência observável de `EXPLAIN ANALYZE` nas queries críticas.

**Where:** `api-service/src/test/java/com/smartmarketplace/controller/BaseIntegrationTest.java`, novos testes IT em `api-service/src/test/java/com/smartmarketplace/controller/`, `api-service/src/test/resources/` se for preciso fixture de apoio

**Depends on:** T24-4  
**Reuses:** `BaseIntegrationTest`, `ProductControllerIT`, `ClientControllerIT`, `OrderControllerIT`

**Requirement:** M24-13, M24-14, M24-15  
**Tools:** MCP: NONE · Skill: tlc-spec-driven

**Done when:**

- [ ] Existe um harness repetível para contar statements nas rotas de catálogo, clientes e pedidos.
- [ ] A validação cobre pelo menos um cenário feliz por rota e preserva os contratos públicos.
- [ ] Há evidência documentada de `EXPLAIN ANALYZE` ou equivalente para as queries críticas do fallback.
- [ ] A evidência mostra melhoria ou, no mínimo, um plano previsível compatível com o hardening proposto.
- [ ] Gate: `cd api-service && ./mvnw verify` exit 0.

**Tests:** it  
**Gate:** full — `cd api-service && ./mvnw verify`
**Commit:** `test(api-service): add relational query-count and explain validation (T24-5)`

---

### T24-6 — Build gate e sincronização documental do milestone

**What:** Fechar o milestone documentalmente: executar o gate completo do `api-service` e sincronizar `ROADMAP.md` / `STATE.md` com o estado real do M24, deixando claro que a especificação foi decomposta e está pronta para execução.

**Where:** `../../project/ROADMAP.md`, `../../project/STATE.md`

**Depends on:** T24-5  
**Reuses:** padrão de fecho documental de M23/M24 e o `design.md` já aprovado

**Requirement:** M24-16  
**Tools:** MCP: NONE · Skill: tlc-spec-driven

**Done when:**

- [ ] `cd api-service && ./mvnw verify` exit 0.
- [ ] `ROADMAP.md` e `STATE.md` apontam para o estado actual do M24 sem divergência documental.
- [ ] O milestone fica explícito como pronto para execução, sem abrir escopo novo.
- [ ] Nenhum comportamento funcional fora do hardening relacional é alterado.

**Tests:** build  
**Gate:** DoD — `cd api-service && ./mvnw verify`
**Commit:** `chore(m24): verify relational hardening milestone and sync planning docs (T24-6)`

---

## Parallel execution map

| Phase | Tasks | Notas |
|-------|-------|------|
| 1 | T24-1 → T24-2 → T24-3 | Sequência obrigatória por partilha de `ClientApplicationService.java` e por dependência conceptual dos loaders. |
| 2 | T24-4 | Consolida schema e fallback depois de estabilizar as rotas críticas. |
| 3 | T24-5 | Validação de query count e `EXPLAIN ANALYZE` sobre a superfície já endurecida. |
| 4 | T24-6 | Gate final + fecho documental. |

---

## Rastreio spec

| Requirement | Tasks |
|-------------|-------|
| M24-01 | T24-1 |
| M24-02 | T24-1 |
| M24-03 | T24-1 |
| M24-04 | T24-1 |
| M24-05 | T24-2 |
| M24-06 | T24-3 |
| M24-07 | T24-3 |
| M24-08 | T24-2, T24-3 |
| M24-09 | T24-4 |
| M24-10 | T24-4 |
| M24-11 | T24-4 |
| M24-12 | T24-4 |
| M24-13 | T24-5 |
| M24-14 | T24-5 |
| M24-15 | T24-5 |
| M24-16 | T24-6 |

---

_Fim das tarefas M24._

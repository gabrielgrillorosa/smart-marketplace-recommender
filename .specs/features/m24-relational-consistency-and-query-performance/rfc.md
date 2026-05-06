# RFC M24 — Hardening relacional para entrega do projeto

## 1) Header & Metadata

- **ID:** RFC-M24-REL-001
- **Título:** Corrigir consistência relacional, eliminar N+1 e completar indexação para o marco final de improvement
- **Status:** DRAFT
- **Tipo:** Technical / Architecture
- **Impacto:** HIGH
- **Data de criação:** 2026-05-05
- **Última revisão:** 2026-05-05
- **Driver:** Engenharia Staff / revisão final de banco e performance
- **Approvers:** Sponsor técnico do projeto, owner do repositório, responsável por backend/API
- **Contributors:** `api-service`, revisão de dados PostgreSQL, frontend consumidor das rotas de catálogo/clientes/pedidos
- **Prazo de decisão:** Proposta: 2026-05-08
- **Milestone relacionado:** **M24 — Relational Consistency & Query Performance Hardening**

---

## 2) Background

O projeto já avançou em confiabilidade entre PostgreSQL e Neo4j com o padrão de transactional outbox, mas ainda há dois problemas relacionais relevantes no caminho crítico do `api-service`:

1. **N+1 queries nas rotas de catálogo, clientes e pedidos**
2. **Lacunas de indexação e custo excessivo no fallback query de recomendação**

Esses problemas não impedem a demonstração funcional, mas afetam diretamente:

- latência sob carga
- previsibilidade de performance
- consistência entre o contrato exposto e o custo real da consulta
- qualidade da entrega final do projeto como referência de arquitetura aplicada

Há evidência concreta no código atual:

- `ProductApplicationService.listProducts()` usa `productRepository.findAll(...)` e depois acessa `p.getSupplier().getName()` e `p.getCountries()` ao montar `ProductSummaryDTO`, o que expõe risco clássico de N+1 em associações lazy.
- `ClientApplicationService.listClients()` usa `clientRepository.findAll(...)` e em seguida acessa `c.getCountry().getCode()`, novamente com associação lazy.
- `ClientApplicationService.listClientOrders()` usa `orderRepository.findByClientIdOrderByOrderDateDesc(...)` e depois percorre `o.getItems()` e `i.getProduct().getName()` para montar `OrderDTO`, criando cascata típica `orders -> items -> product`.
- O `FallbackRecommendationQuery` já foi migrado para JDBC por clareza, mas ainda depende de agregações e subconsultas em tabelas que não possuem todos os índices compatíveis com os padrões de acesso mais frequentes.
- Em `infra/postgres/init.sql`, existem índices importantes como `idx_order_items_product` e `idx_order_items_order`, mas faltam índices evidentes para consultas por `orders.client_id`, `orders.order_date`, `product_countries.country_code`, e combinações que suportem melhor o fallback e as rotas paginadas.

O custo de inação é conhecido:

- crescimento de latência conforme o volume de clientes/pedidos aumentar
- comportamento irregular entre ambientes pequenos e ambientes mais densos
- degradação do valor didático do projeto, porque o código parece correto do ponto de vista funcional, mas não está suficientemente endurecido para uma leitura Staff/Principal em persistência relacional

---

## 3) Assumptions

1. **As rotas de catálogo, clientes e pedidos continuarão sendo usadas como parte central da demonstração final do projeto.**  
   **Confiança:** Alta.  
   **Invalida se:** o escopo final reduzir essas rotas a papel secundário ou apenas interno.

2. **O volume atual de dados sintéticos não revela todo o custo do N+1, mas o padrão de acesso já é tecnicamente incorreto para uma entrega final.**  
   **Confiança:** Alta.  
   **Invalida se:** benchmarks com logging SQL e `EXPLAIN ANALYZE` mostrarem custo desprezível e estável mesmo em escala ampliada.

3. **O fallback relacional seguirá existindo como parte do desenho oficial de resiliência do projeto.**  
   **Confiança:** Alta.  
   **Invalida se:** a decisão de arquitetura mudar para falha explícita sem fallback.

4. **É viável corrigir esses problemas em um milestone dedicado sem reabrir o desenho do domínio.**  
   **Confiança:** Média-Alta.  
   **Invalida se:** a remoção de N+1 exigir redesenho amplo de DTOs, paginação ou contratos HTTP.

5. **O projeto se beneficia mais de um hardening cirúrgico do que de uma refatoração completa da camada de persistência.**  
   **Confiança:** Alta.  
   **Invalida se:** durante a implementação ficar claro que os repositórios atuais exigem reestruturação profunda.

---

## 4) Decision Criteria

Critérios definidos antes das opções (peso total = 100):

1. **Impacto em latência e custo de query (30):** reduzir número de round-trips e melhorar planos de execução nas rotas críticas.
2. **Segurança para entrega final (25):** hardening suficiente sem introduzir regressões funcionais perto do marco final.
3. **Escopo controlado (20):** corrigir os problemas reais sem reescrever a arquitetura inteira de repositórios.
4. **Clareza arquitetural (15):** deixar explícito no código que as rotas listadas não aceitam N+1 como comportamento implícito.
5. **Observabilidade e validação (10):** permitir verificação por testes, SQL logging e `EXPLAIN`.

**Must-haves:**

- eliminar N+1 nas rotas de catálogo, clientes e pedidos
- adicionar os índices faltantes com justificativa por padrão de acesso
- reescrever ou ajustar o fallback query com foco em custo previsível
- preservar compatibilidade funcional dos endpoints públicos
- sair do milestone com evidência verificável de melhoria

---

## 5) Options Considered

### Opção A — Não agir agora (status quo / do nothing)

Aceitar a implementação atual, mantendo foco apenas na parte funcional e no README final.

### Opção B — Ajustes mínimos localizados

Adicionar alguns índices e um ou dois `JOIN FETCH`, sem criar um milestone próprio nem revisar o caminho completo das três áreas afetadas.

### Opção C — Criar o milestone M24 de hardening relacional (proposta)

Abrir um marco específico de improvement para:

- corrigir N+1 em `listProducts`, `listClients` e `listClientOrders`
- revisar repositórios e queries com `JOIN FETCH`, `@EntityGraph` ou queries dedicadas conforme o caso
- adicionar índices faltantes em `orders`, `product_countries` e tabelas relacionadas ao fallback
- revisar o `FallbackRecommendationQuery` com `EXPLAIN ANALYZE`, índice adequado e custo previsível
- validar com testes e checagens direcionadas

---

## 6) Relevant Data

### Evidência atual no código

**Catálogo**

- `ProductApplicationService.listProducts()`:
  - busca `Page<Product>` genérica
  - acessa `supplier` e `countries` durante o mapeamento para DTO
  - risco: 1 query da página + queries adicionais por fornecedor/países

**Clientes**

- `ClientApplicationService.listClients()`:
  - usa `clientRepository.findAll(...)`
  - acessa `c.getCountry().getCode()`
  - risco: 1 query da página + N loads de `country`

**Pedidos**

- `ClientApplicationService.listClientOrders()`:
  - usa `orderRepository.findByClientIdOrderByOrderDateDesc(...)`
  - acessa `o.getItems()` e `i.getProduct()`
  - risco: N+1 em dois níveis (`orders`, depois `items.product`)

### Índices presentes hoje

`infra/postgres/init.sql` já contém:

- `idx_products_category`
- `idx_products_supplier`
- `idx_clients_country`
- `idx_order_items_product`
- `idx_order_items_order`
- `idx_cart_items_cart`
- `idx_cart_items_product`
- `idx_integration_outbox_pending`

### Índices claramente ausentes para os padrões atuais

Os padrões de acesso sugerem fortemente a necessidade de avaliar e, se aprovados em benchmark SQL, adicionar:

- índice em `orders(client_id, order_date desc)`
- índice em `orders(client_id)`
- índice em `product_countries(country_code, product_id)`
- eventual índice de suporte para `products(created_at)` ou combinações usadas nas rotas paginadas, se o plano mostrar necessidade

### Problema do fallback query

O fallback atual resolve corretamente a semântica funcional, mas combina:

- filtro por país
- exclusão de comprados
- agregação por vendas
- priorização por categoria no caso `from-cart`

Isso significa que o custo final depende fortemente de:

- seletividade de `product_countries`
- acesso a `orders` por `client_id`
- agregação em `order_items`

Sem os índices corretos, a query funciona, mas perde previsibilidade sob crescimento de volume.

---

## 7) Pros and Cons

### Opção A — Status quo

**Prós**

- zero custo imediato
- nenhuma chance de regressão no curto prazo

**Contras**

- mantém N+1 explícito em rotas centrais
- mantém dívida relacional visível na entrega final
- deixa o fallback dependente de otimizações insuficientes de schema

### Opção B — Ajustes mínimos localizados

**Prós**

- menor esforço
- possível ganho parcial de latência

**Contras**

- risco de correção incompleta
- tende a tratar sintomas, não o conjunto dos padrões de acesso
- não cria narrativa clara de "milestone de hardening" para fechamento do projeto

### Opção C — Milestone M24 de hardening relacional

**Prós**

- resolve os dois problemas de forma coordenada
- melhora a qualidade da entrega final
- cria trilha clara de validação e aceitação
- preserva o desenho atual sem refatoração excessiva

**Contras**

- adiciona um marco extra no plano
- exige disciplina de validação com SQL e testes
- pode revelar ajustes adicionais de paginação/DTO durante a implementação

---

## 8) Estimated Cost

- **Opção A:** ~0.5 dia (somente documentação do risco e aceitação explícita da dívida)
- **Opção B:** ~1-2 dias úteis
- **Opção C:** ~3-5 dias úteis

Estimativa da Opção C por macro-etapas:

1. mapear e corrigir N+1 nas 3 rotas críticas (1-2 dias)
2. adicionar/revisar índices com validação SQL (`EXPLAIN ANALYZE`) (1 dia)
3. revisar fallback query e validar impacto (1 dia)
4. testes, benchmark dirigido e documentação de aceite (0.5-1 dia)

---

## 9) Recommended Option

**Recomendação:** **Opção C — criar o milestone M24 de hardening relacional antes da entrega final do projeto**.

Justificativa ligada aos critérios:

- **Impacto em latência e custo (30):** é a única opção que trata N+1 e indexação de forma combinada.
- **Segurança para entrega final (25):** evita uma entrega visualmente madura, mas com deficiência relacional básica.
- **Escopo controlado (20):** o trabalho é cirúrgico e limitado a rotas e queries já identificadas.
- **Clareza arquitetural (15):** consolida um padrão explícito de leitura otimizada para DTOs.
- **Observabilidade e validação (10):** cria espaço formal para medir antes/depois.

Proposta de decisão:

- aprovar M24 como **milestone final de improvement**
- usar o milestone como gate de entrega técnica
- considerar o projeto "pronto para entrega" somente após:
  - remoção do N+1 nas três áreas
  - índices aprovados por evidência de plano de execução
  - fallback query revisado e documentado

---

## 10) Action Items

1. **Specify:** criar o spec do M24 com requisitos rastreáveis para N+1, indexação e fallback.
2. **Design:** definir abordagem por rota:
   - catálogo: query dedicada / fetch graph para `supplier` + `countries`
   - clientes: fetch do `country` na listagem
   - pedidos: carregamento otimizado de `items` + `product`
3. **Tasks:** quebrar a execução em tarefas atômicas:
   - T1 corrigir catálogo
   - T2 corrigir clientes
   - T3 corrigir pedidos
   - T4 adicionar índices
   - T5 revisar fallback query
   - T6 validar com testes + `EXPLAIN`
4. **Validation:** capturar evidência antes/depois:
   - contagem de queries por endpoint
   - planos de execução das queries críticas
   - smoke tests funcionais
5. **Rollout:** aplicar como improvement controlado e revisar README/entrega final com os resultados.

---

## 11) Outcome

**Pendente de decisão.**

- Decisão final: `APPROVED | REJECTED | NEEDS_REVISION`
- Data:
- Observações:
- Follow-up esperado: `spec.md`, `design.md` e `tasks.md` do M24

---

## Resources

- `api-service/src/main/java/com/smartmarketplace/service/ProductApplicationService.java`
- `api-service/src/main/java/com/smartmarketplace/service/ClientApplicationService.java`
- `api-service/src/main/java/com/smartmarketplace/repository/ProductRepository.java`
- `api-service/src/main/java/com/smartmarketplace/repository/ClientRepository.java`
- `api-service/src/main/java/com/smartmarketplace/repository/OrderRepository.java`
- `api-service/src/main/java/com/smartmarketplace/repository/FallbackRecommendationQuery.java`
- `infra/postgres/init.sql`
- RFC anterior de referência de formato: `.specs/features/m23-negative-sampling-soft-hard-ranking/rfc.md`

# M24 — Hardening relacional e query performance do `api-service`

**Status:** VERIFIED (implementado e validado; ver [design.md](./design.md), [tasks.md](./tasks.md) e gate `mvn verify`)  
**Data:** 2026-05-05  
**RFC canónica:** [RFC-M24-REL-001](./rfc.md)

---

## Problem Statement

O `api-service` já entrega o fluxo funcional principal, mas ainda mantém três pontos de fragilidade relacional no caminho crítico:

1. `listProducts()` mapeia `supplier` e `countries` a partir de uma página de `Product`, com risco de N+1 durante o enriquecimento do DTO.
2. `listClients()` lê `country` por cliente ao montar a listagem, com o mesmo padrão de amplificação por acesso lazy.
3. `listClientOrders()` percorre `orders -> items -> product` para montar a resposta, o que pode gerar cascata de queries e custo variável conforme o volume.

Em paralelo, o fallback relacional de recomendação depende de padrões de acesso que ainda não têm toda a indexação compatível, o que reduz previsibilidade de latência e dificulta ler o plano de execução como evidência de robustez final.

---

## Goals

- [x] **G1:** Eliminar N+1 nas rotas de catálogo, clientes e pedidos sem alterar os contratos públicos existentes.
- [x] **G2:** Garantir que o carregamento das relações necessárias seja feito de forma explícita e previsível, com número de queries compatível com paginação e DTOs.
- [x] **G3:** Adicionar ou consolidar índices para os padrões de acesso reais de `orders`, `product_countries` e apoio ao fallback.
- [x] **G4:** Revisar o fallback query para manter semântica estável e custo mais previsível sob crescimento de dados.
- [x] **G5:** Validar a melhoria com testes e evidência observável, incluindo contagem de queries e `EXPLAIN ANALYZE` nas consultas críticas.
- [x] **G6:** Manter o escopo cirúrgico do milestone, sem reescrever a camada de persistência ou alterar o domínio funcional do projeto.

---

## Out of Scope

| Item | Reason |
|------|--------|
| Refatoração completa dos repositórios JPA para uma nova arquitetura de persistência | O milestone foca hardening localizado, não uma reescrita estrutural. |
| Mudanças de frontend ou copy de UI | O problema é relacional/performance no backend. |
| Alteração dos contratos públicos de catálogo, clientes, pedidos ou fallback | A entrega deve permanecer compatível com os consumidores actuais. |
| Mudança da lógica de recomendação ou do significado funcional das respostas | O objectivo é endurecer a execução, não mudar a semântica. |
| Introdução de novas features de produto fora das rotas já identificadas | M24 deve manter o escopo controlado. |

---

## User Stories

### P1: Catálogo sem N+1

**User Story:** Como consumidor da API de catálogo, quero listar produtos com fornecedor e países sem crescimento descontrolado de queries, para que a listagem continue estável e previsível.

**Why P1:** `listProducts()` está no caminho central do demo e já expõe acesso a associações lazy durante o mapeamento do DTO; sem corrigir isso primeiro, a percepção de performance do resto do milestone fica comprometida.

**Acceptance Criteria:**

1. WHEN `listProducts()` for executado THEN o carregamento de `supplier` e `countries` SHALL ocorrer de forma otimizada, sem uma query adicional por produto durante o mapeamento do DTO.
2. WHEN a listagem for paginada THEN a paginação SHALL continuar correta, sem duplicação de linhas nem alteração da ordem contratual.
3. WHEN filtros por `category`, `country`, `supplier` e `search` forem aplicados THEN o resultado SHALL manter a mesma semântica funcional observada hoje.
4. WHEN `getProduct()` for chamado THEN a rota SHALL continuar a devolver o detalhe completo do produto sem regressões de consistência relacional.

**Independent Test:** Executar a listagem de produtos com logging SQL activado e confirmar que o número de queries não escala por produto na página; validar também que a resposta permanece idêntica em shape e conteúdo funcional.

**Requirements:** M24-01 — M24-04

---

### P2: Clientes e pedidos com carregamento previsível

**User Story:** Como consumidor das rotas de clientes e pedidos, quero obter listagens completas sem cascatas de queries implícitas, para que a API mantenha latência previsível mesmo com mais dados.

**Why P2:** `listClients()` e `listClientOrders()` usam relações que tendem a sofrer com lazy loading em cascata; corrigir isso junto evita que o milestone resolva apenas metade do problema relacional.

**Acceptance Criteria:**

1. WHEN `listClients()` for executado THEN `country` SHALL ser obtido sem query adicional por cliente durante o mapeamento do DTO.
2. WHEN `listClientOrders()` for executado THEN `orders`, `items` e `product` SHALL ser carregados de forma optimizada, sem N+1 em dois níveis.
3. WHEN a listagem de pedidos do cliente for paginada THEN a ordem por `orderDate DESC` SHALL permanecer estável e o contrato da resposta SHALL permanecer inalterado.
4. WHEN `getClient()` for executado THEN o resumo de compras SHALL continuar correcto e compatível com o comportamento actual.

**Independent Test:** Rodar consultas de listagem de clientes e pedidos com um dataset representativo, verificando o total de queries, a preservação da paginação e a integridade dos DTOs retornados.

**Requirements:** M24-05 — M24-08

---

### P3: Índices e fallback relacional mais previsível

**User Story:** Como responsável técnico, quero que o schema e o fallback de recomendação estejam alinhados aos padrões de acesso reais, para que a entrega final não dependa de consultas caras por acidente.

**Why P3:** O fallback já é funcional, mas depende de joins, exclusões e agregações que ficam sensíveis à indexação. Endurecer o schema e revisar a query fecha o ciclo de performance relacional.

**Acceptance Criteria:**

1. WHEN o schema for validado THEN SHALL existir suporte de índice adequado para `orders(client_id, order_date desc)` ou equivalente justificável pelo plano de execução.
2. WHEN o schema for validado THEN SHALL existir suporte de índice adequado para `product_countries(country_code, product_id)` ou equivalente justificável pelo plano de execução.
3. WHEN a query de fallback for executada para `topSelling` THEN a semântica de país e exclusão de produtos já comprados pelo cliente SHALL permanecer inalterada.
4. WHEN a query de fallback for executada para `topSellingForCart` THEN a exclusão dos itens do carrinho e a priorização por categoria SHALL permanecer inalteradas.
5. WHEN `EXPLAIN ANALYZE` for executado nas consultas críticas THEN a evidência SHALL mostrar um plano mais previsível e compatível com a otimização proposta.

**Independent Test:** Comparar o plano de execução e o tempo relativo das consultas críticas antes/depois da indexação e da revisão do fallback, mantendo o mesmo dataset e parâmetros.

**Requirements:** M24-09 — M24-13

---

### P4: Validação e entrega sem regressão

**User Story:** Como integrador do projeto, quero uma validação clara do hardening relacional, para que o milestone possa ser fechado com evidência e sem risco de regressão funcional.

**Why P4:** Sem uma camada explícita de validação, o milestone corre o risco de melhorar performance de forma local mas sem prova suficiente para a entrega final.

**Acceptance Criteria:**

1. WHEN a implementação estiver concluída THEN SHALL existir pelo menos uma verificação automatizada que cubra as rotas afectadas com foco em query count ou comportamento relacional.
2. WHEN as rotas afectadas forem exercitadas THEN os contratos públicos SHALL permanecer compatíveis com os consumidores actuais.
3. WHEN a validação final for executada THEN SHALL haver evidência documentada de melhoria nos pontos atacados pelo milestone, incluindo observação de queries e/ou plano de execução.
4. WHEN o milestone for considerado pronto THEN o escopo SHALL continuar limitado ao hardening relacional, sem expansão para redesign de domínio.

**Independent Test:** Executar a suite de validação acordada para o milestone e confirmar que as rotas continuam funcionais, com menos amplificação de queries e com índices/fallback verificáveis.

**Requirements:** M24-14 — M24-16

---

## Edge Cases

- WHEN `listProducts()` tiver muitos produtos na página THEN o carregamento das relações SHALL continuar bounded e não degenerar em query por item.
- WHEN `listClients()` ou `listClientOrders()` forem executados com páginas vazias THEN o comportamento SHALL permanecer estável e sem queries supérfluas.
- WHEN uma relação esperada estiver ausente em um registo válido THEN o DTO SHALL continuar a ser montado de forma consistente ou com o erro já definido pelo domínio.
- WHEN o plano de execução não justificar um índice inicialmente previsto THEN a decisão SHALL ser documentada com base em `EXPLAIN`, não por hipótese.
- WHEN o fallback query for ajustado THEN a semântica funcional SHALL permanecer a mesma, mesmo que a forma interna da consulta mude.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status | Statement |
| ---------------- | ----- | ----- | ------ | --------- |
| **M24-01** | P1 | Spec | Verified | `listProducts()` **SHALL** carregar `supplier` e `countries` sem query adicional por produto durante o mapeamento do DTO. |
| **M24-02** | P1 | Spec | Verified | A paginação de `listProducts()` **SHALL** permanecer correcta, sem duplicação de linhas ou alteração de ordem contratual. |
| **M24-03** | P1 | Spec | Verified | Os filtros de catálogo **SHALL** preservar a semântica funcional actual. |
| **M24-04** | P1 | Spec | Verified | `getProduct()` **SHALL** continuar a devolver o detalhe completo sem regressão relacional. |
| **M24-05** | P2 | Spec | Verified | `listClients()` **SHALL** carregar `country` sem query adicional por cliente durante o mapeamento do DTO. |
| **M24-06** | P2 | Spec | Verified | `listClientOrders()` **SHALL** carregar `orders`, `items` e `product` de forma optimizada, sem N+1 em cascata. |
| **M24-07** | P2 | Spec | Verified | A paginação e a ordenação por `orderDate DESC` em `listClientOrders()` **SHALL** permanecer correctas e estáveis. |
| **M24-08** | P2 | Spec | Verified | `getClient()` **SHALL** continuar a devolver o resumo de compras correcto e compatível com o comportamento actual. |
| **M24-09** | P3 | Spec | Verified | O schema **SHALL** ter suporte de índice para `orders(client_id, order_date desc)` ou equivalente justificável. |
| **M24-10** | P3 | Spec | Verified | O schema **SHALL** ter suporte de índice para `product_countries(country_code, product_id)` ou equivalente justificável. |
| **M24-11** | P3 | Spec | Verified | O fallback `topSelling()` **SHALL** manter a semântica de país e exclusão de produtos já comprados. |
| **M24-12** | P3 | Spec | Verified | O fallback `topSellingForCart()` **SHALL** manter a exclusão dos itens do carrinho e a priorização por categoria. |
| **M24-13** | P3 | Spec | Verified | A validação **SHALL** incluir `EXPLAIN ANALYZE` ou evidência equivalente sobre as consultas críticas. |
| **M24-14** | P4 | Spec | Verified | A implementação **SHALL** incluir verificação automatizada focada em query count ou comportamento relacional. |
| **M24-15** | P4 | Spec | Verified | Os contratos públicos das rotas afectadas **SHALL** permanecer compatíveis com os consumidores actuais. |
| **M24-16** | Cross | Spec | Verified | O milestone M24 **SHALL** referenciar a RFC canónica antes de abrir `design.md` e `tasks.md`, sem expandir o escopo para redesign de domínio. |

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 16 total (**M24-01**…**M24-16**); P1 = 4, P2 = 4, P3 = 5, P4 = 3, Cross = 1.

---

## Success Criteria

- [x] `listProducts()` não exibe amplificação de queries por item da página ao enriquecer o DTO.
- [x] `listClients()` não exibe query por cliente ao mapear o país.
- [x] `listClientOrders()` não exibe cascata N+1 em `orders -> items -> product`.
- [x] Os índices definidos para o milestone estão presentes e justificáveis por padrão de acesso e/ou `EXPLAIN`.
- [x] O fallback de recomendação mantém a semântica funcional e passa a ter custo mais previsível.
- [x] A validação final inclui evidência observável de melhoria e não introduz regressões funcionais nas rotas públicas.

---

## References

- [RFC M24](./rfc.md)
- [ProductApplicationService](../../../api-service/src/main/java/com/smartmarketplace/service/ProductApplicationService.java)
- [ClientApplicationService](../../../api-service/src/main/java/com/smartmarketplace/service/ClientApplicationService.java)
- [ProductRepository](../../../api-service/src/main/java/com/smartmarketplace/repository/ProductRepository.java)
- [ClientRepository](../../../api-service/src/main/java/com/smartmarketplace/repository/ClientRepository.java)
- [OrderRepository](../../../api-service/src/main/java/com/smartmarketplace/repository/OrderRepository.java)
- [FallbackRecommendationQuery](../../../api-service/src/main/java/com/smartmarketplace/repository/FallbackRecommendationQuery.java)
- [Schema init](../../../infra/postgres/init.sql)
- [ROADMAP](../../project/ROADMAP.md)
- [STATE](../../project/STATE.md)

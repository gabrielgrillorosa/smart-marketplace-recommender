# M15 — Cart Integrity & Comparative UX — Especificação

**Status:** IMPLEMENTED — reconciliado com o código e os testes em 2026-04-29. O milestone foi fechado com bloqueio por país no carrinho, enriquecimento transitório do `ClientProfileCard`, mensagens coerentes entre backend/frontend e copy final para `promoted`, `rejected`, `failed` e `unknown`.

## Problema

O `M13` definiu o ciclo principal `Carrinho -> Checkout -> Pedido -> Treino`, e o `M14` passou a tornar esse showcase visível no catálogo e na aba `Análise`. Mesmo assim, ainda restavam três gaps que reduziam a credibilidade da experiência:

1. Itens incompatíveis com o país do cliente ainda podiam entrar no carrinho e só falhavam tarde demais.
2. O `ClientProfileCard` podia exibir um falso estado vazio, apesar de a API já expor `purchaseSummary` e histórico de pedidos.
3. O caso `rejected` podia parecer bug, porque `Pos-Efetivar` podia ficar visualmente igual ao modelo atual sem explicação suficiente.

O `M15` fecha esses gaps finais de integridade e UX comparativa: o carrinho respeita o contexto do cliente antes do checkout, o perfil do cliente reflete dados reais de pedidos, e os resultados de `promoted/rejected/failed/unknown` são compreensíveis sem inspeção de logs ou código.

## Goals

- [x] Bloquear produtos incompatíveis com o país do cliente já no `Adicionar ao Carrinho`, antes do checkout
- [x] Manter feedback coerente entre backend e frontend para ações inválidas de carrinho, sem mensagens contraditórias ou genéricas
- [x] Enriquecer o cliente selecionado com dados reais de pedidos para o `ClientProfileCard`
- [x] Tornar os estados `promoted`, `rejected`, `failed` e `unknown` claros para o avaliador no fluxo `Com Carrinho -> Pos-Efetivar`
- [x] Preservar degradação graciosa quando enriquecimento de perfil ou status do modelo falham, sem quebrar o fluxo principal do showcase

## Fora de Escopo

| Feature | Motivo |
|---|---|
| Persistência de carrinho, checkout, sync `afterCommit` e polling por `currentVersion` | Escopo do `M13` |
| Cobertura de score em toda a grade, ranking window, `Com Carrinho` reativo e migração principal de vocabulário | Escopo do `M14` |
| Mudanças no algoritmo de recomendação, promotion gate ou pesos do score híbrido | Já definidos em milestones anteriores |
| SSE/WebSocket para eventos do modelo | Deferred pós-MVP |
| Modo permissivo/feature flag para ignorar validação por país no fluxo principal | Fora do escopo do MVP atual; qualquer bypass futuro deve ser decisão explícita |
| Redesenho estrutural da aba `Análise` | `M15` faz polish de integridade e copy, não uma nova arquitetura visual |

---

## User Stories

### P1: Carrinho bloqueia produtos incompatíveis com o país do cliente ⭐ MVP

**User Story:** Como avaliador, quero que o carrinho impeça adicionar produtos indisponíveis para o país do cliente selecionado, para que o showcase reflita regras de negócio reais e não falhe apenas no checkout.

**Acceptance Criteria:**

1. WHEN `POST /api/v1/carts/{clientId}/items` recebe um `productId` cujo produto não está disponível no país do cliente THEN o `api-service` SHALL rejeitar a operação antes de persistir o item, usando o contrato padrão `ErrorResponse`
2. WHEN uma tentativa incompatível é rejeitada THEN o carrinho ativo SHALL permanecer inalterado
3. WHEN o produto é compatível com o país do cliente THEN a operação de adicionar item SHALL continuar funcionando normalmente
4. WHEN o produto compatível já existe no carrinho THEN a quantidade SHALL continuar sendo incrementada conforme a semântica atual de upsert
5. WHEN o catálogo renderiza produtos para um cliente selecionado THEN o frontend SHALL desabilitar proativamente `Adicionar ao Carrinho` para itens incompatíveis com o país desse cliente
6. WHEN a ação está desabilitada por incompatibilidade THEN a UI SHALL expor um motivo explícito para o bloqueio, mencionando indisponibilidade por país ou contexto equivalente
7. WHEN nenhum cliente está selecionado THEN a razão de bloqueio SHALL continuar sendo distinta do caso de incompatibilidade por país
8. WHEN uma tentativa inválida chega ao frontend por caminho não visual (request manual, proxy, estado stale) THEN a mensagem retornada pelo backend SHALL ser apresentada de forma consistente, sem fallback para erro genérico
9. WHEN um carrinho ativo já contém item incompatível por estado legado, manipulação manual ou divergência de dados THEN o checkout SHALL permanecer bloqueado até remoção do item inválido, com feedback explícito
10. WHEN frontend e backend divergem temporariamente sobre compatibilidade por causa de dados stale THEN o backend SHALL continuar sendo a fonte de verdade, e o frontend SHALL reconciliar o estado com base na resposta do servidor

**Independent Test:** Selecionar cliente `BR` -> localizar produto sem `BR` em `availableCountries` -> verificar botão desabilitado com motivo -> forçar `POST /carts/{clientId}/items` manualmente -> backend rejeita sem alterar o carrinho -> adicionar produto compatível continua funcionando.

---

### P1: Perfil do cliente é enriquecido com dados reais de pedidos ⭐ MVP

**User Story:** Como avaliador, quero que o `ClientProfileCard` mostre o histórico real do cliente selecionado, para que a aba `Análise` reflita contexto verdadeiro de compra e não um placeholder zerado.

**Acceptance Criteria:**

1. WHEN o usuário seleciona um cliente THEN o frontend SHALL buscar `GET /api/v1/clients/{id}` para obter `purchaseSummary`
2. WHEN o usuário seleciona um cliente THEN o frontend SHALL buscar `GET /api/v1/clients/{id}/orders` para derivar produtos recentes
3. WHEN o enriquecimento ainda está em andamento THEN o `ClientProfileCard` SHALL renderizar estado de loading ou skeleton, em vez de mostrar zeros e lista vazia como se fossem dados definitivos
4. WHEN a resposta de detalhe chega com sucesso THEN o estado do cliente selecionado SHALL ser enriquecido com `totalOrders`, `totalSpent` e `lastOrderAt`
5. WHEN a resposta de pedidos chega com sucesso THEN o estado do cliente selecionado SHALL ser enriquecido com até 5 produtos recentes derivados dos pedidos mais novos
6. WHEN o cliente selecionado não possui pedidos THEN o card SHALL mostrar um estado vazio verdadeiro, baseado em dados reais (`0`, `null`, lista vazia), e não em placeholder indevido
7. WHEN uma das chamadas de enriquecimento falha THEN o cliente selecionado SHALL continuar utilizável para catálogo, carrinho e recomendações
8. WHEN ambas as chamadas de enriquecimento falham THEN a UI SHALL degradar com fallback gracioso no card, sem limpar o cliente selecionado e sem quebrar o fluxo principal
9. WHEN o usuário troca de cliente antes de uma resposta anterior chegar THEN a resposta stale SHALL não sobrescrever o cliente atualmente selecionado
10. WHEN os dados enriquecidos estão disponíveis THEN o `ClientProfileCard` SHALL exibir total de pedidos, valor gasto, data do último pedido e produtos recentes de forma consistente na aba `Análise`

**Independent Test:** Selecionar um cliente seedado com pedidos -> observar skeleton breve -> validar que o card passa a mostrar total de pedidos, total gasto, última compra e produtos recentes reais -> trocar rapidamente de cliente e confirmar que não ocorre sobrescrita stale.

---

### P1: Estados comparativos finais ficam claros para o avaliador ⭐ MVP

**User Story:** Como avaliador, quero entender claramente o que aconteceu após o checkout quando o modelo é promovido, rejeitado, falha ou fica indefinido, para não interpretar ausência de mudança visual como bug.

**Acceptance Criteria:**

1. WHEN o `ModelStatusPanel` renderiza qualquer estado THEN seu título e descrição SHALL usar copy orientada ao avaliador, sem expor labels internas como `ModelStatusPanel`
2. WHEN um retrain pós-checkout é `promoted` THEN o painel SHALL explicar que `Pos-Efetivar` agora reflete a nova versão ativa do modelo
3. WHEN um retrain pós-checkout é `rejected` THEN o painel SHALL explicar que o modelo atual foi mantido e informar o motivo da rejeição do candidato
4. WHEN `Pos-Efetivar` reutiliza recomendações do modelo atual porque o candidato foi rejeitado THEN a UI de análise SHALL exibir banner, label ou aviso explícito informando que a ausência de mudança visível é esperada
5. WHEN um retrain pós-checkout falha THEN o painel SHALL explicar que nenhum novo snapshot pós-checkout foi aplicado e que as recomendações ativas continuam sendo do modelo anterior
6. WHEN o estado chega a `unknown` por timeout THEN a copy de refresh manual SHALL permanecer coerente com a narrativa do checkout, sem sugerir sucesso ou falha implícitos
7. WHEN os controles manuais/avançados de retrain estão visíveis THEN eles SHALL continuar claramente rotulados como caminho secundário ou diagnóstico, fora do fluxo principal
8. WHEN painel, toast ou banner comparativo mencionam a jornada de aprendizado THEN a terminologia SHALL permanecer alinhada com `Com Carrinho -> Pos-Efetivar`, não com `Demo`
9. WHEN não há mudança visual de ranking e isso pode parecer defeito THEN a copy de `rejected` ou `failed` SHALL desambiguar comportamento esperado de mau funcionamento da UI
10. WHEN o avaliador chega na aba `Análise` após checkout THEN a combinação de estado do painel e feedback visual da coluna SHALL ser suficiente para entender se o modelo foi promovido, rejeitado, falhou ou ainda aguarda conclusão, sem precisar olhar logs

**Independent Test:** Simular ou mockar respostas de status `promoted`, `rejected`, `failed` e `unknown` -> validar textos do painel e banner/feedback de `Pos-Efetivar` -> confirmar que o caso "sem mudança visível" deixa de parecer bug.

---

## Edge Cases

- WHEN um item incompatível já existe no carrinho por estado legado THEN a UI SHALL sinalizar claramente o problema e impedir checkout silencioso
- WHEN o frontend acredita que um produto é compatível, mas o backend rejeita a inclusão por dados mais novos THEN o erro do backend SHALL prevalecer e o carrinho SHALL ser reconciliado sem estado fantasma
- WHEN o usuário alterna rapidamente entre clientes THEN respostas de enriquecimento anteriores SHALL ser descartadas para evitar perfil cruzado
- WHEN o cliente selecionado não possui histórico THEN o `ClientProfileCard` SHALL mostrar zero e vazio reais, não loading permanente nem erro genérico
- WHEN o candidato é rejeitado e `Pos-Efetivar` fica igual a `Com Carrinho` THEN a UI SHALL explicitar que o modelo atual foi mantido
- WHEN o enriquecimento do perfil falha, mas o restante da aba continua funcional THEN o card SHALL degradar localmente sem bloquear carrinho, recomendações ou checkout

---

## Traceabilidade de Requisitos

| Requirement ID | Story | Fase | Status |
|---|---|---|---|
| INTEG-01 | P1: Validar disponibilidade por país em `POST /carts/{clientId}/items` | Execute | Implemented |
| INTEG-02 | P1: Rejeição não altera o carrinho ativo | Execute | Implemented |
| INTEG-03 | P1: Produto compatível continua adicionável | Execute | Implemented |
| INTEG-04 | P1: Upsert compatível preserva incremento de quantidade | Execute | Implemented |
| INTEG-05 | P1: Frontend desabilita `Adicionar ao Carrinho` para item incompatível | Execute | Implemented |
| INTEG-06 | P1: UI expõe motivo explícito do bloqueio por país | Execute | Implemented |
| INTEG-07 | P1: Motivo `sem cliente` continua distinto de `produto incompatível` | Execute | Implemented |
| INTEG-08 | P1: Mensagem de erro inválido propaga de forma consistente no frontend | Execute | Implemented |
| INTEG-09 | P1: Carrinho legado/inválido bloqueia checkout até correção | Execute | Implemented |
| INTEG-10 | P1: Backend permanece fonte de verdade em divergência stale | Execute | Implemented |
| INTEG-11 | P1: Seleção de cliente dispara `GET /clients/{id}` | Execute | Implemented |
| INTEG-12 | P1: Seleção de cliente dispara `GET /clients/{id}/orders` | Execute | Implemented |
| INTEG-13 | P1: `ClientProfileCard` mostra loading/skeleton durante enriquecimento | Execute | Implemented |
| INTEG-14 | P1: Estado do cliente incorpora `totalOrders`, `totalSpent`, `lastOrderAt` | Execute | Implemented |
| INTEG-15 | P1: Estado do cliente incorpora até 5 produtos recentes | Execute | Implemented |
| INTEG-16 | P1: Cliente sem pedidos mostra estado vazio verdadeiro | Execute | Implemented |
| INTEG-17 | P1: Falha parcial de enriquecimento não quebra o fluxo principal | Execute | Implemented |
| INTEG-18 | P1: Falha total de enriquecimento mantém cliente selecionado e fallback local | Execute | Implemented |
| INTEG-19 | P1: Resposta stale não sobrescreve cliente mais recente | Execute | Implemented |
| INTEG-20 | P1: `ClientProfileCard` renderiza estatísticas e produtos recentes reais | Execute | Implemented |
| INTEG-21 | P1: `ModelStatusPanel` usa copy orientada ao avaliador | Execute | Implemented |
| INTEG-22 | P1: Estado `promoted` explica nova versão ativa em `Pos-Efetivar` | Execute | Implemented |
| INTEG-23 | P1: Estado `rejected` explica manutenção do modelo atual e motivo | Execute | Implemented |
| INTEG-24 | P1: `Pos-Efetivar` exibe aviso explícito quando reutiliza o modelo atual | Execute | Implemented |
| INTEG-25 | P1: Estado `failed` explica ausência de novo snapshot pós-checkout | Execute | Implemented |
| INTEG-26 | P1: Estado `unknown` mantém narrativa coerente e CTA de refresh | Execute | Implemented |
| INTEG-27 | P1: Retrain manual permanece claramente secundário/diagnóstico | Execute | Implemented |
| INTEG-28 | P1: Terminologia visual permanece alinhada a `Com Carrinho -> Pos-Efetivar` | Execute | Implemented |
| INTEG-29 | P1: Copy desambigua ausência de mudança visual vs bug | Execute | Implemented |
| INTEG-30 | P1: Painel + feedback da coluna tornam o resultado inteligível sem logs | Execute | Implemented |

**Total:** 30 requisitos | P1: 30

---

## Contexto Técnico Relevante (pós-execução)

### Estado atual confirmado no código

- `api-service/src/main/java/com/smartmarketplace/service/ProductAvailabilityPolicy.java` concentra a regra compartilhada `assertAvailableForClientCountry()` / `assertAllAvailableForClientCountry()`
- `api-service/src/main/java/com/smartmarketplace/service/CartApplicationService.java` aplica a policy antes de criar ou mutar o carrinho, e `OrderApplicationService` reaproveita a mesma invariável no checkout
- `frontend/lib/cart-integrity.ts` expõe `resolveCartActionAvailability()` e `collectCartIntegrityIssues()`, usados por `CatalogPanel.tsx` e `CartSummaryBar.tsx`
- `frontend/lib/hooks/useSelectedClientProfile.ts` faz `Promise.allSettled()` de detalhe + pedidos, usa `AbortController` e protege contra respostas stale sem persistir metadados transitórios no Zustand
- `frontend/components/client/ClientProfileCard.tsx` já renderiza `loading`, `ready`, `empty`, `partial` e `unavailable`, incluindo `totalSpent`, `lastOrderAt` e produtos recentes
- `frontend/components/retrain/ModelStatusPanel.tsx` e `frontend/lib/showcase/post-checkout-outcome.ts` explicam `promoted`, `rejected`, `failed` e `unknown`, mantendo o retrain manual como affordance secundária de diagnóstico
- A cobertura principal de validação está em `ProductAvailabilityPolicyTest`, `CartApplicationServiceTest`, `CartControllerIT` e `frontend/e2e/tests/m15-cart-integrity-comparative-ux.spec.ts`

### Implicações para a próxima fase

- Não há blocker funcional restante de `M15` para iniciar `M16`
- A migração de dados legados `BOUGHT {is_demo: true}` continua rastreada separadamente como débito pós-AD-043
- Melhorias futuras de explicabilidade passam a pertencer a `M16`, não mais ao escopo de integridade/UX comparativa deste milestone

---

## Critérios de Sucesso

- [x] Um cliente `BR` não consegue adicionar ao carrinho um produto fora de `BR`, e o motivo é compreensível tanto antes quanto depois de um request forçado
- [x] O `ClientProfileCard` deixa de exibir falso vazio para clientes com histórico e passa a refletir dados reais de pedidos
- [x] O fluxo principal de catálogo, carrinho, checkout e recomendações continua utilizável mesmo se o enriquecimento de perfil falhar
- [x] Os estados `promoted`, `rejected`, `failed` e `unknown` deixam de parecer ambíguos para o avaliador na aba `Análise`
- [x] O caso "sem mudança visível" em `Pos-Efetivar` passa a ser explicado explicitamente, em vez de parecer defeito da UI

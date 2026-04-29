# M14 — Catalog Score Visibility & Cart-Aware Showcase — Especificação

## Problema

O fluxo principal do projeto já foi reorientado para `Carrinho -> Checkout -> Pedido -> Treino` no `M13`, e o frontend já contém partes dessa migração: `AnalysisPanel.tsx` usa as colunas `Com Carrinho` e `Pos-Efetivar`, `ProductCard.tsx` já mostra ação `Adicionar ao Carrinho`, e o store já possui `cartSlice`.

O problema é que a experiência ainda não comunica esse showcase com clareza suficiente:

1. O catálogo ordenado por IA continua limitado a scores dos top-10, porque `useRecommendationFetcher.ts` e `AnalysisPanel.tsx` ainda chamam recomendações com `limit: 10`.
2. O avaliador não consegue ver score em todos os produtos relevantes da grade atual, então itens que "sumiram" podem ter apenas saído do top-10.
3. A leitura comparativa entre `Com IA -> Com Carrinho -> Pos-Efetivar` ainda não destaca deltas de posição e score com clareza suficiente para demonstrar o efeito do carrinho.
4. O fluxo principal ainda convive com vocabulário e testes legados de `Demo Buy`, o que enfraquece a narrativa arquitetural aprovada em AD-043.

O M14 fecha esse gap de observabilidade e linguagem: o avaliador deve conseguir ordenar o catálogo por IA com score visível em toda a grade relevante, montar o carrinho e ver a coluna `Com Carrinho` reagir a cada mudança, e interpretar os deltas até `Pos-Efetivar` sem ambiguidade.

## Goals

- [ ] Exibir score em todos os itens relevantes da grade do catálogo quando `Ordenar por IA` estiver ativo, sem depender de um top-10 fixo
- [ ] Fazer a coluna `Com Carrinho` reagir a toda mudança relevante de composição do carrinho, sem congelar no primeiro snapshot
- [ ] Tornar legíveis os deltas entre `Com IA`, `Com Carrinho` e `Pos-Efetivar`, com posição anterior, posição nova e variação de score
- [ ] Concluir a migração de vocabulário do fluxo principal para semântica de carrinho, removendo termos `Demo` da jornada principal
- [ ] Oferecer um modo/cap diagnóstico explícito para catálogos maiores, sem fallback silencioso para `limit: 10`
- [ ] Garantir consistência de marca/categoria nos cards e detalhes de produto durante o showcase

## Fora de Escopo

| Feature | Motivo |
|---|---|
| Persistência de carrinho, checkout, polling por `currentVersion` e `ModelStatusPanel` | Escopo do `M13` |
| Validação por país em `POST /carts/{clientId}/items` e mensagens de integridade | Escopo do `M15` |
| `ClientProfileCard` com dados reais de pedidos (`GET /clients/{id}` + `/orders`) | Escopo do `M15` |
| Substituir polling por SSE/WebSocket | Deferred pós-MVP |
| Endpoint para comparar recomendações do `candidate` rejeitado | Deferred pós-MVP |
| Unificar ordenação por IA do catálogo com resultados de busca semântica | Fora do escopo deste milestone; `M14` cobre a grade principal filtrada do catálogo |

---

## User Stories

### P1: Score visível em toda a grade ordenada por IA ⭐ MVP

**User Story:** Como avaliador, quero ver score em todos os produtos relevantes exibidos no catálogo ao ativar `Ordenar por IA`, para entender não só o top-10, mas também quais itens caíram, subiram ou ficaram estáveis no ranking.

**Por que P1:** É o núcleo do `M14`. Sem cobertura de score na grade inteira, o showcase continua ambíguo e AD-042 não se materializa.

**Acceptance Criteria:**

1. WHEN o avaliador ativa `Ordenar por IA` no catálogo com um cliente selecionado THEN o frontend SHALL buscar scores para toda a grade filtrada atualmente visível, sem fixar `limit: 10`
2. WHEN a grade está em modo ordenado por IA THEN cada card exibido nessa grade SHALL renderizar `ScoreBadge` com `finalScore`, `neuralScore` e `semanticScore`
3. WHEN filtros de categoria, país ou supplier mudam com o modo ordenado ativo THEN o frontend SHALL recomputar a cobertura de scores para a nova grade filtrada
4. WHEN o avaliador desativa `Ordenar por IA` THEN a grade SHALL voltar à ordem original e os score badges SHALL desaparecer
5. WHEN nenhum cliente está selecionado THEN o botão `Ordenar por IA` SHALL permanecer desabilitado e nenhuma requisição de score SHALL ser enviada
6. WHEN o catálogo precisa carregar scores para a grade completa THEN a UI SHALL exibir estado de carregamento compatível com esse fetch ampliado, sem mostrar badges stale de uma execução anterior
7. WHEN a quantidade de itens exibidos excede o cap configurado do modo diagnóstico/completo THEN a UI SHALL informar explicitamente que a cobertura está truncada, incluindo o total de itens pontuados

**Independent Test:** Selecionar cliente → aplicar filtro com >10 produtos → ativar `Ordenar por IA` → confirmar que todos os cards filtrados exibem badge de score, não apenas 10.

---

### P1: Timeline `Com Carrinho` reativa a cada mudança ⭐ MVP

**User Story:** Como avaliador, quero que a coluna `Com Carrinho` mude toda vez que eu adiciono ou removo itens relevantes do carrinho, para observar a intenção atual da sessão sem precisar fazer checkout.

**Por que P1:** O valor pedagógico do novo fluxo aprovado em AD-043 depende dessa reatividade. Se `Com Carrinho` congelar ou ficar preso ao primeiro snapshot, o showcase continua contando a história errada.

**Acceptance Criteria:**

1. WHEN a fase `Com IA` já foi capturada e o primeiro item distinto entra no carrinho THEN o showcase SHALL capturar a fase `Com Carrinho` com base no estado atual do carrinho
2. WHEN um novo item distinto é adicionado ao carrinho THEN a fase `Com Carrinho` SHALL ser recapturada com base na composição mais recente do carrinho
3. WHEN um item é removido do carrinho THEN a fase `Com Carrinho` SHALL ser recapturada com base na composição restante
4. WHEN o carrinho é esvaziado THEN o showcase SHALL limpar a fase `Com Carrinho`, voltar ao baseline `Com IA`, e remover deltas que dependiam do carrinho
5. WHEN a fase `Pos-Efetivar` já existe e o usuário inicia uma nova sessão de carrinho THEN `Com Carrinho` SHALL continuar reativo às novas mudanças, enquanto `Pos-Efetivar` SHALL permanecer como o último snapshot confirmado até novo checkout ou reset
6. WHEN o cliente selecionado muda THEN os snapshots `Com Carrinho` e `Pos-Efetivar` SHALL ser resetados junto com o estado da análise
7. WHEN o showcase compara `Com IA`, `Com Carrinho` e `Pos-Efetivar` THEN as três fases SHALL usar a mesma profundidade/cap de ranking para evitar deltas enganosos
8. WHEN múltiplas mudanças de carrinho ocorrem na mesma sessão THEN o sistema SHALL substituir o snapshot anterior de `Com Carrinho`, e não congelar no primeiro evento

**Independent Test:** Selecionar cliente → capturar `Com IA` → adicionar item A → confirmar `Com Carrinho` → adicionar item B → confirmar novo snapshot diferente → remover B → confirmar nova recaptura → esvaziar carrinho → coluna volta ao estado vazio/baseline.

---

### P1: Migração completa do vocabulário principal para carrinho ⭐ MVP

**User Story:** Como avaliador, quero ver uma narrativa coerente de carrinho em todo o fluxo principal, para que a experiência reflita a arquitetura final do projeto e não misture conceitos legados de `Demo`.

**Por que P1:** A arquitetura mudou no AD-043. Se a linguagem principal continuar falando em `Demo`, o produto passa a mensagem errada mesmo quando a implementação técnica já migrou.

**Acceptance Criteria:**

1. WHEN o usuário interage com o fluxo principal do catálogo THEN a CTA primária SHALL ser `Adicionar ao Carrinho`, não `Demo Comprar`
2. WHEN o usuário limpa os itens da sessão atual THEN a ação SHALL ser rotulada `Esvaziar Carrinho`, não `Limpar Demo`
3. WHEN a coluna intermediária do showcase é exibida THEN seu título SHALL ser `Com Carrinho`, não `Com Demo`
4. WHEN a jornada principal do catálogo, análise e checkout é renderizada THEN labels, textos de apoio e mensagens SHALL evitar terminologia `Demo` nesse caminho
5. WHEN o fluxo principal consome estado de intenção de sessão THEN ele SHALL depender de abstrações de carrinho, não de `demoBoughtByClient` ou equivalente legado
6. WHEN restarem caminhos legados de demonstração manual THEN eles SHALL ficar isolados de forma explícita como `avançado`, `legado` ou `modo demo`, fora do caminho principal
7. WHEN os testes E2E do fluxo principal forem executados THEN asserts, nomes e expectativas SHALL usar vocabulário de carrinho
8. WHEN seletores/test IDs do fluxo principal forem atualizados THEN SHALL refletir semântica de carrinho para reduzir ambiguidade futura
9. WHEN o texto explicativo do showcase for exibido THEN a sequência SHALL refletir `selecionar cliente -> montar carrinho -> checkout -> pos-efetivar`

**Independent Test:** Abrir catálogo e análise → verificar ausência de `Demo Comprar`, `Limpar Demo` e `Com Demo` no fluxo principal → executar E2E da jornada principal usando apenas termos de carrinho.

---

### P2: Deltas comparativos legíveis entre fases

**User Story:** Como avaliador, quero ver posição anterior, posição nova e delta de score entre `Com IA`, `Com Carrinho` e `Pos-Efetivar`, para interpretar rapidamente o impacto do carrinho e do checkout.

**Por que P2:** O `M14` é um milestone de observabilidade/showcase. Sem deltas explícitos, a comparação continua exigindo leitura manual produto a produto.

**Acceptance Criteria:**

1. WHEN um produto aparece em `Com Carrinho` e também em `Com IA` THEN a UI SHALL mostrar sua posição anterior e sua posição nova
2. WHEN um produto aparece em `Pos-Efetivar` e também em `Com Carrinho` THEN a UI SHALL mostrar sua posição anterior e sua posição nova
3. WHEN um produto existe em duas fases comparadas THEN a UI SHALL mostrar a variação do score entre elas
4. WHEN um produto mantém a mesma posição e o mesmo score THEN a UI SHALL mostrar estado neutro explícito (`0`, `sem mudança` ou equivalente), não silêncio
5. WHEN um produto entra no conjunto comparado sem existir na fase anterior THEN a UI SHALL sinalizar isso como `novo` ou equivalente
6. WHEN um produto estava fora do conjunto comparado anterior por causa do cap/ranking THEN a UI SHALL sinalizar `fora do ranking` ou equivalente, em vez de mostrar delta numérico enganoso
7. WHEN os deltas forem calculados THEN SHALL usar identidade de produto consistente (`product.id`) entre as fases
8. WHEN uma fase comparada estiver vazia THEN a UI SHALL renderizar estado explícito de ausência de comparação, sem badges de delta inválidos
9. WHEN o avaliador observa o showcase completo THEN SHALL ser possível identificar rapidamente o que mudou de `Com IA -> Com Carrinho -> Pos-Efetivar` sem leitura manual de todas as listas

**Independent Test:** Capturar `Com IA` → montar carrinho → efetivar checkout → verificar que pelo menos os itens alterados exibem posição anterior, posição nova e delta visível nas transições.

---

### P2: Cap/mode diagnóstico explícito para cobertura maior que top-10

**User Story:** Como engenheiro demonstrando o sistema, quero um comportamento explícito para catálogos maiores que o top-10, para que o showcase não volte silenciosamente ao limite legado.

**Por que P2:** O dataset atual cabe confortavelmente em até 100 itens, mas a arquitetura do showcase precisa deixar claro o que acontece se o catálogo crescer.

**Acceptance Criteria:**

1. WHEN o dataset padrão atual do projeto é usado THEN o modo normal SHALL conseguir cobrir toda a grade filtrada sem toggle manual
2. WHEN a grade relevante excede o cap padrão THEN o sistema SHALL oferecer modo diagnóstico ou configuração explícita para ampliar a cobertura
3. WHEN um cap é aplicado THEN a UI SHALL informar quantos itens receberam score e quantos ficaram fora da cobertura
4. WHEN catálogo e análise comparam fases distintas THEN o mesmo cap/configuração SHALL ser aplicado de forma consistente às capturas comparáveis
5. WHEN o showcase entra em modo de cobertura ampliada THEN ele SHALL evitar fallback silencioso para `limit: 10`

**Independent Test:** Simular cap reduzido ou modo diagnóstico → validar que a UI comunica truncamento; restaurar cap ampliado → validar cobertura maior sem mudança silenciosa de comportamento.

---

### P2: Marca e categoria consistentes durante o showcase

**User Story:** Como avaliador, quero ver marca e categoria de forma consistente nos cards e detalhes do produto, para contextualizar melhor os movimentos do ranking.

**Por que P2:** O showcase depende de interpretação rápida. Se o produto muda de posição mas perde contexto de marca/categoria, o ganho didático diminui.

**Acceptance Criteria:**

1. WHEN um card de produto é exibido no catálogo THEN categoria SHALL estar visível no card
2. WHEN um card de produto é exibido no catálogo THEN supplier/marca SHALL estar visível no card
3. WHEN o catálogo está em modo ordenado por IA THEN categoria e supplier SHALL continuar visíveis, independentemente do score badge
4. WHEN o modal de detalhe do produto é aberto THEN categoria e supplier SHALL refletir os mesmos valores exibidos no card
5. WHEN o avaliador usa o showcase para comparar produtos semelhantes THEN o contexto de marca/categoria SHALL permanecer suficiente para desambiguar os itens mais relevantes

**Independent Test:** Ordenar catálogo por IA → abrir detalhe de um produto → confirmar que categoria e supplier visíveis no card coincidem com o modal.

---

## Edge Cases

- WHEN o carrinho contém zero itens após uma sequência de add/remove THEN a coluna `Com Carrinho` SHALL voltar ao estado vazio/baseline, sem manter timestamp ou delta stale
- WHEN o usuário troca filtros com `Ordenar por IA` ativo THEN itens removidos da grade filtrada SHALL perder score visível, e a nova grade SHALL receber cobertura coerente
- WHEN o cap aplicado cobre menos itens do que os exibidos THEN a UI SHALL comunicar truncamento em vez de aparentar que itens sem badge não têm score
- WHEN `Pos-Efetivar` é capturado mas não há mudança visível para certo produto THEN a UI SHALL mostrar delta neutro explícito, não ausência de informação
- WHEN a jornada principal ainda mantém features legadas de `Demo` fora do caminho principal THEN elas SHALL ficar isoladas e não dirigir a análise `Com Carrinho`
- WHEN dois produtos têm nomes parecidos ou da mesma marca THEN contexto de categoria/supplier SHALL permanecer disponível para evitar leitura ambígua

---

## Traceabilidade de Requisitos

| Requirement ID | Story | Fase | Status |
|---|---|---|---|
| SHOW-01 | P1: Cobertura de score para toda a grade filtrada visível | Design | Pending |
| SHOW-02 | P1: Sem `limit: 10` fixo no catálogo ordenado por IA | Design | Pending |
| SHOW-03 | P1: Todo card exibido em modo ordenado renderiza `ScoreBadge` | Design | Pending |
| SHOW-04 | P1: Mudança de filtros recarrega cobertura de score | Design | Pending |
| SHOW-05 | P1: Desativar ordenação remove badges e restaura ordem original | Design | Pending |
| SHOW-06 | P1: Sem cliente selecionado, ordenação fica desabilitada | Design | Pending |
| SHOW-07 | P1: Loading/truncation state explícito durante fetch ampliado | Design | Pending |
| SHOW-08 | P1: Primeiro item distinto captura fase `Com Carrinho` | Design | Pending |
| SHOW-09 | P1: Novo item distinto recaptura `Com Carrinho` | Design | Pending |
| SHOW-10 | P1: Remover item recaptura `Com Carrinho` | Design | Pending |
| SHOW-11 | P1: Carrinho vazio volta o showcase ao baseline | Design | Pending |
| SHOW-12 | P1: Profundidade/cap consistente entre `Com IA`, `Com Carrinho` e `Pos-Efetivar` | Design | Pending |
| SHOW-13 | P1: Troca de cliente reseta snapshots cart/post-checkout | Design | Pending |
| SHOW-14 | P1: `Pos-Efetivar` persiste até novo checkout ou reset | Design | Pending |
| SHOW-15 | P1: `Com Carrinho` não congela no primeiro evento | Design | Pending |
| SHOW-16 | P1: CTA principal usa `Adicionar ao Carrinho` | Design | Pending |
| SHOW-17 | P1: Ação de limpeza usa `Esvaziar Carrinho` | Design | Pending |
| SHOW-18 | P1: Jornada principal remove `Demo Comprar` | Design | Pending |
| SHOW-19 | P1: Jornada principal remove `Limpar Demo` | Design | Pending |
| SHOW-20 | P1: Jornada principal remove `Com Demo` | Design | Pending |
| SHOW-21 | P1: Fluxo principal depende de estado de carrinho, não de `demoBoughtByClient` | Design | Pending |
| SHOW-22 | P1: Caminhos legados de demo ficam isolados como avançado/legado | Design | Pending |
| SHOW-23 | P1: E2E principal adota vocabulário de carrinho | Design | Pending |
| SHOW-24 | P1: Seletores/test IDs principais adotam semântica de carrinho | Design | Pending |
| SHOW-25 | P2: UI mostra posição anterior em `Com IA -> Com Carrinho` | Design | Pending |
| SHOW-26 | P2: UI mostra posição anterior em `Com Carrinho -> Pos-Efetivar` | Design | Pending |
| SHOW-27 | P2: UI mostra delta de score entre fases comparadas | Design | Pending |
| SHOW-28 | P2: UI mostra posição nova na fase atual | Design | Pending |
| SHOW-29 | P2: Estado neutro explícito para zero delta | Design | Pending |
| SHOW-30 | P2: Produto novo entra com label explícita | Design | Pending |
| SHOW-31 | P2: Produto fora do ranking anterior é sinalizado explicitamente | Design | Pending |
| SHOW-32 | P2: Deltas usam identidade consistente por `product.id` | Design | Pending |
| SHOW-33 | P2: Fase vazia não gera delta inválido | Design | Pending |
| SHOW-34 | P2: Dataset padrão cobre grade filtrada sem toggle manual | Design | Pending |
| SHOW-35 | P2: Existe modo/cap diagnóstico explícito para cobertura ampliada | Design | Pending |
| SHOW-36 | P2: UI comunica quantidade pontuada vs truncada | Design | Pending |
| SHOW-37 | P2: Mesmo cap/configuração aplicado nas fases comparáveis | Design | Pending |
| SHOW-38 | P2: Sem fallback silencioso para top-10 no showcase | Design | Pending |
| SHOW-39 | P2: Card de produto exibe categoria | Design | Pending |
| SHOW-40 | P2: Card de produto exibe supplier/marca | Design | Pending |
| SHOW-41 | P2: Modo ordenado por IA preserva categoria/supplier visíveis | Design | Pending |
| SHOW-42 | P2: Modal de detalhe reflete a mesma categoria/supplier do card | Design | Pending |
| SHOW-43 | P2: Contexto de marca/categoria permanece suficiente para desambiguar itens relevantes | Design | Pending |

**Total:** 43 requisitos | P1: 24 | P2: 19

---

## Contexto Técnico Relevante (para Design)

### Estado atual confirmado no código

- `frontend/components/recommendations/AnalysisPanel.tsx` já usa a semântica nova (`Com Carrinho`, `Pos-Efetivar`) e o `analysisSlice` já tipa as fases como `empty | initial | cart | postCheckout`
- Apesar disso, `AnalysisPanel.tsx` ainda chama `fetch('/api/proxy/recommend', { body: { clientId, limit: 10 } })` e `fetch('/api/proxy/recommend/from-cart', { body: { clientId, productIds, limit: 10 } })`
- `frontend/lib/hooks/useRecommendationFetcher.ts` ainda faz `POST /api/proxy/recommend` com `limit: 10`, o que explica por que só parte da grade recebe `scoreMap`
- `frontend/components/catalog/CatalogPanel.tsx` carrega até 100 produtos no frontend e já renderiza `ScoreBadge` quando o score existe; o gap é cobertura, não ausência do componente
- `frontend/components/catalog/ProductCard.tsx` e `frontend/components/catalog/ProductDetailModal.tsx` já mostram `category` e `supplier`; o design do `M14` deve preservar essa consistência e decidir se o comparativo precisa de contexto extra
- `frontend/store/index.ts` ainda compõe `createDemoSlice` junto com `createCartSlice`, então a migração semântica do fluxo principal ainda não está totalmente fechada
- Os testes E2E legados `frontend/e2e/tests/m9a-demo-buy.spec.ts` e `frontend/e2e/tests/m11-ai-learning-showcase.spec.ts` ainda validam `Demo Comprar`, `Limpar Demo` e `Com Demo`

### Implicações para a próxima fase

- O design do `M14` deve decidir como calcular a profundidade da grade pontuada: tamanho da grade filtrada, cap fixo configurável, ou modo diagnóstico explícito
- O design deve definir onde os deltas vivem: no `RecommendationColumn`, em badges laterais, em linhas expandidas ou em combinação dessas abordagens
- O design deve explicitar como `Com Carrinho` volta ao baseline quando o carrinho zera, porque o `analysisSlice` atual aceita `captureCartAware([])` mas não modela um retorno explícito a `initial`

---

## Critérios de Sucesso

- [ ] Avaliador seleciona cliente, aplica filtro com mais de 10 produtos e ativa `Ordenar por IA`; todos os cards relevantes exibem score, não apenas o top-10
- [ ] Ao adicionar e remover itens do carrinho, a coluna `Com Carrinho` é recapturada e continua refletindo a composição mais recente da sessão
- [ ] A jornada principal não exibe `Demo Comprar`, `Limpar Demo` ou `Com Demo`; a narrativa visível é coerente com `Carrinho -> Checkout -> Pos-Efetivar`
- [ ] O showcase exibe deltas suficientes para interpretar `Com IA -> Com Carrinho -> Pos-Efetivar` sem leitura manual produto a produto
- [ ] Se houver truncamento por cap diagnóstico, a UI comunica isso explicitamente
- [ ] Categoria e supplier permanecem visíveis e consistentes nos cards e detalhes do produto durante o showcase

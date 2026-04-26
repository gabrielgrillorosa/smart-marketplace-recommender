# M8 — UX Journey Refactor — Specification

**Status**: Pending Design
**Date**: 2026-04-26
**Depends on**: M7 ✅ COMPLETE
**Required by**: M9 (shares Sprint 0 foundations — AD-012)

---

## Problem Statement

O frontend atual (M5) distribui o fluxo de demo em **4 abas separadas**: o avaliador precisa ir em "Cliente" para selecionar um cliente, voltar para "Recomendações" para ver os resultados, e mudar para "Chat RAG" para fazer uma pergunta — três navegações para uma demo que deveria fluir naturalmente. Além disso, a seleção de cliente se perde mentalmente porque fica escondida em uma aba separada e não é visível nas outras telas. O objetivo do M8 é reorganizar a UX em uma **jornada de página única**: cliente persistente na navbar, catálogo com reordenação por IA embutida, e chat RAG acessível como drawer lateral sem abandonar o contexto.

---

## Goals

- [ ] Seleção de cliente fica na navbar — visível e persistente em qualquer aba
- [ ] Catálogo exibe botão "✨ Ordenar por IA" na toolbar que reordena os cards com animação CSS
- [ ] Chat RAG abre como drawer lateral (slide-over) sem navegar para outra aba
- [ ] Fundação de estado global (Zustand) implementada como Sprint 0 — `selectedClient` + `demoState`
- [ ] Componente `<ReorderableGrid>` reutilizável pronto para ser consumido pelo M9

---

## Out of Scope

| Feature | Reason |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Demo Buy / compra simulada | M9 — usa as fundações do M8 mas é feature independente |
| Deep Retrain Showcase (aba "Análise") | M9-B — depende do M9-A |
| Animação Framer Motion | Deferred — CSS transitions são suficientes para o M8 (ver STATE.md Deferred Ideas) |
| Query params `?client=&ai=on` na URL | Deferred — verificar App Router vs Pages Router antes de implementar (ver STATE.md Deferred Ideas) |
| Remover aba "Recomendações" existente | M8 coexiste com a aba; a reordenação no catálogo é uma *nova entrada* para o mesmo dado |
| Paginação server-side | Out of scope desde M5 |
| Autenticação / dark mode / i18n | Out of scope desde M5 |

---

## User Stories

### P1: Sprint 0 — Fundação Zustand ⭐ MVP

**User Story**: Como desenvolvedor, quero uma store Zustand com slices `selectedClient` e `demoState` instalada no projeto antes de qualquer feature do M8/M9 para que todas as features compartilhem o mesmo estado global sem prop drilling.

**Why P1**: Zero features do M8 ou M9 funcionam sem estado global do cliente. Este é o pré-requisito bloqueante para todas as outras histórias. Estimativa: ~3h de setup.

**Acceptance Criteria**:

1. WHEN o pacote `zustand` é instalado THEN `package.json` SHALL conter `"zustand"` como dependência de produção
2. WHEN `frontend/src/store/clientSlice.ts` é criado THEN SHALL exportar `{ selectedClient: Client | null, setSelectedClient, clearSelectedClient }` e persistir `selectedClient` via `zustand/middleware` `persist` com chave `smr-client`
3. WHEN `frontend/src/store/demoSlice.ts` é criado THEN SHALL exportar `{ demoBoughtByClient: Record<string, string[]>, addDemoBought, removeDemoBought, clearDemoForClient }` sem persistência (estado volátil de sessão)
4. WHEN `selectedClient` muda via `setSelectedClient` THEN store SHALL chamar automaticamente `clearDemoForClient(previousClientId)` antes de atualizar o `selectedClient` — dependência explícita entre slices (AD-012, Tensão T2)
5. WHEN `frontend/src/store/index.ts` é criado THEN SHALL reexportar os dois slices via `useAppStore` hook único para que os componentes importem de um único ponto
6. WHEN os React Contexts existentes (`ClientContext`, `RecommendationContext`) são migrados para Zustand THEN os componentes que consumiam `useClient()` e `useRecommendations()` SHALL continuar funcionando com as mesmas interfaces (sem quebra de comportamento)
7. WHEN `layout.tsx` é atualizado THEN SHALL remover os `<ClientProvider>` e `<RecommendationProvider>` wrappers — Zustand não precisa de Provider

**Independent Test**: Selecionar um cliente na navbar, navegar para outra aba, voltar — cliente persiste sem prop drilling. Trocar de cliente — `demoState` anterior é limpo automaticamente.

**Requirement IDs**: M8-01 a M8-07

---

### P1: Sprint 0 — Componente `<ReorderableGrid>` ⭐ MVP

**User Story**: Como desenvolvedor, quero um componente genérico `<ReorderableGrid>` que recebe um array de items com scores e executa a animação de reordenação para que o M8 e o M9 usem exatamente o mesmo componente sem duplicação.

**Why P1**: AD-012 determina que o componente deve ser implementado antes das features que o consomem. Sem ele, a animação seria implementada duas vezes com risco de divergência visual (Tensão T1 da sessão de comitê).

**Acceptance Criteria**:

1. WHEN `frontend/src/components/ReorderableGrid/ReorderableGrid.tsx` é criado THEN SHALL aceitar as props `items: T[]`, `getKey: (item: T) => string`, `getScore: (item: T) => number | undefined`, `renderItem: (item: T) => React.ReactNode`, `ordered: boolean`
2. WHEN `ordered === false` THEN componente SHALL renderizar os items na ordem original recebida (ordem atual do array)
3. WHEN `ordered === true` THEN componente SHALL re-ordenar os items por `getScore(item)` descrescente e aplicar animação CSS de transição de posição (`transform: translateY`, `transition: transform 500ms ease`)
4. WHEN `ordered` muda de `false` para `true` THEN cada item SHALL animar suavemente para sua nova posição sem piscar (re-mount)
5. WHEN `ordered` muda de `true` para `false` THEN items SHALL retornar à ordem original com a mesma animação
6. WHEN um item não tem score (`getScore` retorna `undefined`) THEN componente SHALL posicioná-lo ao final do grid quando `ordered === true`
7. WHEN o componente é renderizado THEN SHALL usar `position: relative` no container e `position: absolute` ou `transform` nos items para viabilizar a animação de troca de posição sem alterar o flow do DOM

**Independent Test**: Montar `<ReorderableGrid>` com 5 items e scores variados, alternar `ordered` entre `true` e `false` — items animam suavemente sem re-mount.

**Requirement IDs**: M8-08 a M8-14

---

### P1: Client Selector na Navbar ⭐ MVP

**User Story**: Como avaliador, quero selecionar o cliente diretamente na navbar para que minha seleção fique visível em qualquer aba que eu esteja navegando.

**Why P1**: Este é o ponto de entrada para toda a jornada de demo. Sem o cliente visível na navbar, as features de reordenação e Demo Buy não têm contexto.

**Acceptance Criteria**:

1. WHEN a aplicação carrega THEN `Header` SHALL exibir um `ClientSelectorDropdown` inline na navbar à direita dos status badges
2. WHEN nenhum cliente está selecionado THEN dropdown SHALL exibir placeholder "Selecionar cliente..."
3. WHEN usuário seleciona um cliente THEN `useAppStore().setSelectedClient(client)` SHALL ser chamado e o dropdown SHALL exibir o nome do cliente selecionado
4. WHEN cliente é selecionado THEN navbar SHALL exibir badge com o país do cliente ao lado do nome (emoji de bandeira: 🇧🇷, 🇲🇽, 🇨🇴, 🇳🇱, 🇷🇴)
5. WHEN usuário navega entre abas THEN o cliente selecionado SHALL permanecer visível no dropdown sem ser reiniciado
6. WHEN usuário seleciona um cliente diferente THEN `demoState` do cliente anterior SHALL ser limpo automaticamente (via store — M8-04)
7. WHEN a lista de clientes está carregando THEN dropdown SHALL exibir estado de loading sem bloquear a navbar
8. WHEN API Service está offline THEN dropdown SHALL exibir mensagem "Clientes indisponíveis" sem quebrar o header

**Independent Test**: Selecionar "Miguel Santos (BR)" na navbar, navegar para Catálogo — nome do cliente permanece visível no header com badge 🇧🇷.

**Requirement IDs**: M8-15 a M8-22

---

### P1: Botão "✨ Ordenar por IA" no Catálogo ⭐ MVP

**User Story**: Como avaliador, quero clicar em "✨ Ordenar por IA" na toolbar do catálogo para ver os produtos reordenados por relevância para o cliente selecionado com uma animação visual.

**Why P1**: Esta é a demonstração mais direta do valor do sistema de recomendação — ver os produtos "se mover" para a ordem que a IA considera relevante é o momento "wow" da demo.

**Acceptance Criteria**:

1. WHEN usuário está na aba "Catálogo" e um cliente está selecionado THEN toolbar SHALL exibir botão "✨ Ordenar por IA" habilitado
2. WHEN nenhum cliente está selecionado THEN botão "✨ Ordenar por IA" SHALL ser exibido mas desabilitado com tooltip "Selecione um cliente na navbar"
3. WHEN usuário clica em "✨ Ordenar por IA" e recomendações ainda não foram carregadas THEN sistema SHALL chamar `POST /api/proxy/recommend` com o `clientId` do cliente selecionado e exibir estado de loading no botão
4. WHEN recomendações já foram carregadas para o cliente atual THEN sistema SHALL reusar as recomendações em cache sem nova requisição (evitar chamada desnecessária)
5. WHEN recomendações retornam THEN `ordered` SHALL mudar para `true` no `<ReorderableGrid>` e os cards SHALL animar para a nova ordem por score descrescente
6. WHEN botão está no estado "ordenado" THEN SHALL exibir label "✕ Ordenação original" para permitir reverter
7. WHEN usuário clica em "✕ Ordenação original" THEN `ordered` SHALL mudar para `false` e cards SHALL animar de volta à ordem original
8. WHEN cliente muda na navbar enquanto catálogo está no modo "ordenado" THEN catálogo SHALL retornar automaticamente para a ordem original (`ordered = false`) e limpar o cache de recomendações do cliente anterior
9. WHEN a requisição de recomendação falha THEN sistema SHALL exibir toast de erro e manter o catálogo na ordem original
10. WHEN filtros de categoria/país/fornecedor estão ativos THEN "Ordenar por IA" SHALL respeitar os filtros — ordena apenas os produtos filtrados, não o catálogo completo

**Independent Test**: Selecionar cliente "Ana Lima (BR)" na navbar, ir para Catálogo, clicar "✨ Ordenar por IA" — cards animam para nova ordem com scores visíveis; clicar "✕ Ordenação original" — cards voltam à posição anterior.

**Requirement IDs**: M8-23 a M8-32

---

### P1: Score Badge nos Cards do Catálogo ⭐ MVP

**User Story**: Como avaliador, quero ver o score de recomendação em cada card do catálogo quando estou no modo "Ordenar por IA" para entender por que a IA ranqueou aquele produto naquela posição.

**Why P1**: Sem os scores visíveis, a reordenação parece arbitrária. Os scores são a prova de que o motor híbrido está funcionando.

**Acceptance Criteria**:

1. WHEN catálogo está no modo `ordered === true` THEN cada `ProductCard` SHALL exibir badge com score final formatado como percentual (ex: `87% match`)
2. WHEN mouse passa sobre o badge de score THEN tooltip SHALL exibir breakdown: `Neural: X.XX`, `Semântico: X.XX`
3. WHEN produto não estava na lista de recomendações retornadas THEN badge SHALL exibir "— sem score" em cinza
4. WHEN catálogo volta para `ordered === false` THEN badges de score SHALL desaparecer dos cards

**Independent Test**: Com catálogo em modo ordenado, verificar que o primeiro card exibe badge "XX% match" e que hover no badge mostra breakdown neural/semântico.

**Requirement IDs**: M8-33 a M8-36

---

### P1: RAG Side Drawer ⭐ MVP

**User Story**: Como avaliador, quero abrir o chat RAG como um drawer lateral deslizante sem sair da aba atual para fazer perguntas sobre o catálogo enquanto ainda estou vendo os produtos.

**Why P1**: O uso natural do RAG é contextual — o avaliador está olhando para o catálogo e quer perguntar "quais dessas bebidas estão disponíveis no México?". Navegar para outra aba quebra esse fluxo.

**Acceptance Criteria**:

1. WHEN usuário está em qualquer aba THEN Header SHALL exibir botão "💬 Chat RAG" (ícone + label) no lado direito da navbar, antes dos status badges
2. WHEN usuário clica em "💬 Chat RAG" THEN SHALL abrir um drawer lateral deslizando da direita com largura de 420px em desktop (`w-[420px]`) e 100% em mobile (`w-full`)
3. WHEN drawer está aberto THEN SHALL exibir overlay semi-transparente sobre o conteúdo principal e o conteúdo principal SHALL ficar visível atrás
4. WHEN usuário clica fora do drawer ou pressiona `Escape` THEN drawer SHALL fechar com animação de saída (slide para direita)
5. WHEN drawer abre THEN o histórico de chat SHALL ser preservado da sessão anterior (estado não é destruído ao fechar/abrir)
6. WHEN drawer está aberto e usuário envia mensagem THEN comportamento do chat (chamada RAG, bolha de resposta, contexto colapsável, prompts de exemplo) SHALL ser idêntico ao `RAGChatPanel` do M5
7. WHEN cliente está selecionado na navbar THEN drawer SHALL exibir cabeçalho "Chat RAG — [nome do cliente]" para contextualização visual
8. WHEN nenhum cliente está selecionado THEN drawer SHALL exibir cabeçalho "Chat RAG" sem menção a cliente

**Independent Test**: Abrir catálogo, selecionar cliente na navbar, clicar "💬 Chat RAG" — drawer desliza da direita sem navegar para outra aba; fechar com Escape — drawer fecha e catálogo permanece visível.

**Requirement IDs**: M8-37 a M8-44

---

### P2: Migração do Painel "Cliente" para modo somente-leitura

**User Story**: Como avaliador, quero que a aba "Cliente" continue existindo com o perfil detalhado do cliente selecionado (segmento, pedidos recentes, histórico de compras) mas sem o seletor de dropdown duplicado — a seleção já acontece na navbar.

**Why P2**: A aba "Cliente" tem informações de contexto valiosas (segmento, histórico detalhado) que não cabem na navbar. Removê-la completamente perde informação; mantê-la com dropdown duplicado é confuso.

**Acceptance Criteria**:

1. WHEN usuário acessa aba "Cliente" e um cliente já está selecionado THEN SHALL exibir `ClientProfileCard` com todos os dados (segmento, país, total de pedidos, últimos 5 produtos)
2. WHEN usuário acessa aba "Cliente" sem cliente selecionado THEN SHALL exibir estado vazio: "Selecione um cliente na navbar para ver o perfil"
3. WHEN aba "Cliente" está sendo exibida THEN SHALL remover o `ClientSelector` dropdown da aba (seleção é feita na navbar)
4. WHEN aba "Cliente" está sendo exibida THEN SHALL remover o `RecommendButton` da aba — o botão "Ordenar por IA" no catálogo é o novo ponto de disparo de recomendações

**Independent Test**: Selecionar cliente na navbar, navegar para aba "Cliente" — ver perfil sem dropdown nem botão "Obter Recomendações".

**Requirement IDs**: M8-45 a M8-48

---

### P2: Aba "Recomendações" — mantida, apontando para o Catálogo

**User Story**: Como avaliador, quero que a aba "Recomendações" continue funcionando com a comparação "Sem IA vs Com IA" mas também mostre instrução para usar o "Ordenar por IA" no catálogo como ponto de entrada principal.

**Why P2**: A aba de comparação lado a lado tem valor pedagógico para mostrar o ranking completo com todos os scores. Não deve ser removida, mas o fluxo principal de demo passa pelo catálogo.

**Acceptance Criteria**:

1. WHEN recomendações ainda não foram carregadas THEN `RecommendationPanel` SHALL exibir banner informativo: "Use '✨ Ordenar por IA' no Catálogo para disparar recomendações — ou selecione um cliente e clique abaixo" com botão "Obter Recomendações" como alternativa
2. WHEN recomendações foram carregadas (via Catálogo ou via botão direto) THEN painel SHALL exibir a comparação lado a lado existente (comportamento atual do M5 preservado)
3. WHEN recomendações são carregadas no Catálogo via "Ordenar por IA" THEN a aba "Recomendações" SHALL exibir os mesmos dados (store compartilhada via Zustand)

**Independent Test**: Ordenar por IA no catálogo, navegar para aba "Recomendações" — ver a comparação com os mesmos produtos, sem precisar clicar "Obter Recomendações" novamente.

**Requirement IDs**: M8-49 a M8-51

---

### P3: Toast de feedback para ações assíncronas

**User Story**: Como avaliador, quero ver notificações toast para ações como "Recomendações carregadas para [cliente]" e erros de requisição para ter feedback claro sem precisar olhar para o estado do botão.

**Why P3**: O toast melhora a percepção de responsividade da demo mas não bloqueia nenhuma funcionalidade P1/P2.

**Acceptance Criteria**:

1. WHEN recomendações são carregadas com sucesso THEN sistema SHALL exibir toast verde: "✓ Recomendações carregadas para [nome do cliente]" por 3 segundos
2. WHEN requisição de recomendação falha THEN sistema SHALL exibir toast vermelho: "Erro ao carregar recomendações — tente novamente"
3. WHEN drawer RAG está carregando resposta e demora > 10s THEN toast SHALL exibir "Aguardando resposta do LLM..." (informativo, não de erro)
4. WHEN toasts são exibidos THEN SHALL aparecer no canto inferior direito, empilhados, com animação de entrada e saída

**Requirement IDs**: M8-52 a M8-55

---

## Edge Cases

- WHEN catálogo está no modo "Ordenar por IA" e usuário aplica filtro de categoria THEN a ordem por IA SHALL ser preservada para os produtos filtrados — não reverter para ordem original
- WHEN catálogo está no modo "Ordenar por IA" e busca semântica é ativada THEN busca semântica SHALL ter precedência — sair do modo "Ordenar por IA" e exibir resultados ranqueados por similaridade semântica
- WHEN drawer RAG está aberto e usuário troca de aba THEN drawer SHALL permanecer aberto sobre o novo conteúdo de aba
- WHEN `<ReorderableGrid>` recebe array vazio THEN SHALL renderizar `EmptyState` do componente pai sem erro
- WHEN `selectedClient` é lido do `persist` no hydration THEN `demoState` SHALL estar sempre vazio (não é persistido) — nunca restaurar estado de demo de sessão anterior
- WHEN dois cliques rápidos em "✨ Ordenar por IA" THEN segunda requisição SHALL ser ignorada se a primeira ainda está em flight (`loading === true`)
- WHEN API Service está offline THEN dropdown de cliente na navbar SHALL exibir erro inline sem derrubar o Header inteiro

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----------------------------------------------------------------- | ------ | ------- |
| M8-01 | P1: Sprint 0 — instalação Zustand | Design | Pending |
| M8-02 | P1: Sprint 0 — clientSlice com persist | Design | Pending |
| M8-03 | P1: Sprint 0 — demoSlice sem persist | Design | Pending |
| M8-04 | P1: Sprint 0 — clearDemo ao trocar cliente | Design | Pending |
| M8-05 | P1: Sprint 0 — useAppStore único hook | Design | Pending |
| M8-06 | P1: Sprint 0 — migração dos Contexts | Design | Pending |
| M8-07 | P1: Sprint 0 — remoção dos Providers do layout | Design | Pending |
| M8-08 | P1: ReorderableGrid — assinatura de props | Design | Pending |
| M8-09 | P1: ReorderableGrid — ordem original quando ordered=false | Design | Pending |
| M8-10 | P1: ReorderableGrid — ordenação por score quando ordered=true | Design | Pending |
| M8-11 | P1: ReorderableGrid — animação ao mudar ordered | Design | Pending |
| M8-12 | P1: ReorderableGrid — animação de reversão | Design | Pending |
| M8-13 | P1: ReorderableGrid — items sem score ao final | Design | Pending |
| M8-14 | P1: ReorderableGrid — position strategy para animação | Design | Pending |
| M8-15 | P1: Navbar — ClientSelectorDropdown no Header | Design | Pending |
| M8-16 | P1: Navbar — placeholder sem seleção | Design | Pending |
| M8-17 | P1: Navbar — setSelectedClient ao selecionar | Design | Pending |
| M8-18 | P1: Navbar — badge de país | Design | Pending |
| M8-19 | P1: Navbar — persistência entre abas | Design | Pending |
| M8-20 | P1: Navbar — clearDemo ao trocar cliente | Design | Pending |
| M8-21 | P1: Navbar — loading state do dropdown | Design | Pending |
| M8-22 | P1: Navbar — offline graceful | Design | Pending |
| M8-23 | P1: Catálogo — botão habilitado com cliente | Design | Pending |
| M8-24 | P1: Catálogo — botão desabilitado sem cliente | Design | Pending |
| M8-25 | P1: Catálogo — chamada POST /recommend ao clicar | Design | Pending |
| M8-26 | P1: Catálogo — cache de recomendações | Design | Pending |
| M8-27 | P1: Catálogo — animação ordered=true | Design | Pending |
| M8-28 | P1: Catálogo — label "✕ Ordenação original" | Design | Pending |
| M8-29 | P1: Catálogo — reverter com animação | Design | Pending |
| M8-30 | P1: Catálogo — reset ao trocar cliente | Design | Pending |
| M8-31 | P1: Catálogo — toast de erro em falha | Design | Pending |
| M8-32 | P1: Catálogo — respeitar filtros ativos | Design | Pending |
| M8-33 | P1: Score Badge — percentual no card | Design | Pending |
| M8-34 | P1: Score Badge — tooltip breakdown | Design | Pending |
| M8-35 | P1: Score Badge — sem score em cinza | Design | Pending |
| M8-36 | P1: Score Badge — desaparecer no modo original | Design | Pending |
| M8-37 | P1: Drawer — botão "💬 Chat RAG" no Header | Design | Pending |
| M8-38 | P1: Drawer — slide-over da direita | Design | Pending |
| M8-39 | P1: Drawer — overlay semi-transparente | Design | Pending |
| M8-40 | P1: Drawer — fechar com clique fora ou Escape | Design | Pending |
| M8-41 | P1: Drawer — histórico preservado ao reabrir | Design | Pending |
| M8-42 | P1: Drawer — comportamento de chat idêntico ao M5 | Design | Pending |
| M8-43 | P1: Drawer — cabeçalho com nome do cliente | Design | Pending |
| M8-44 | P1: Drawer — cabeçalho sem cliente | Design | Pending |
| M8-45 | P2: Aba Cliente — perfil somente-leitura | - | Pending |
| M8-46 | P2: Aba Cliente — estado vazio sem seleção | - | Pending |
| M8-47 | P2: Aba Cliente — remover ClientSelector | - | Pending |
| M8-48 | P2: Aba Cliente — remover RecommendButton | - | Pending |
| M8-49 | P2: Aba Recomendações — banner instrução | - | Pending |
| M8-50 | P2: Aba Recomendações — comportamento M5 preservado | - | Pending |
| M8-51 | P2: Aba Recomendações — store compartilhada | - | Pending |
| M8-52 | P3: Toast — sucesso de recomendações | - | Pending |
| M8-53 | P3: Toast — erro de recomendações | - | Pending |
| M8-54 | P3: Toast — LLM demorando | - | Pending |
| M8-55 | P3: Toast — posição e animação | - | Pending |

**Coverage:** 55 total, 44 mapeados para Design (P1), 11 pendentes (P2/P3) ⚠️

---

## Stack Constraints

Segue o stack do M5 com uma adição:

- **Framework:** Next.js 14 (App Router, já configurado)
- **UI:** Tailwind CSS + shadcn/ui (já instalado em M5)
- **Estado global:** **Zustand** (nova dependência — substituirá os React Contexts de M5)
- **Animação:** CSS `transform` + `transition` (nenhuma nova dependência — Framer Motion deferred)
- **HTTP:** `fetch` nativo via `lib/fetch-wrapper.ts` existente
- **Novos componentes shadcn necessários:** `Sheet` (para o drawer) — instalar no Design

**Novos arquivos/diretórios:**

```
frontend/
├── src/store/
│   ├── index.ts              (useAppStore — hook unificado)
│   ├── clientSlice.ts
│   └── demoSlice.ts
├── components/
│   ├── ReorderableGrid/
│   │   └── ReorderableGrid.tsx
│   ├── layout/
│   │   ├── Header.tsx        (atualizado — adiciona ClientSelectorDropdown + botão Drawer)
│   │   └── ClientSelectorDropdown.tsx  (novo)
│   ├── catalog/
│   │   └── CatalogPanel.tsx  (atualizado — adiciona toolbar com botão "Ordenar por IA")
│   └── chat/
│       └── RAGDrawer.tsx     (novo — wrapper Sheet para o chat)
```

---

## Dependency Map

```
M8-01..07 (Sprint 0 Zustand)
  └─► M8-15..22 (Navbar Client Selector)
  └─► M8-08..14 (ReorderableGrid)
        └─► M8-23..32 (Botão "Ordenar por IA" no Catálogo)
              └─► M8-33..36 (Score Badge nos Cards)
  └─► M8-37..44 (RAG Drawer)
  └─► M8-45..48 (Aba Cliente — somente-leitura) [P2]
  └─► M8-49..51 (Aba Recomendações — banner) [P2]
        └─► M8-52..55 (Toast feedback) [P3]
```

---

## Success Criteria

- [ ] Seleção de cliente na navbar persiste ao navegar entre todas as abas
- [ ] Cards do catálogo animam ao clicar "✨ Ordenar por IA" e voltam com "✕ Ordenação original"
- [ ] Chat RAG abre como drawer lateral sem trocar de aba
- [ ] `<ReorderableGrid>` é genérico o suficiente para o M9 reutilizá-lo sem modificação
- [ ] Zustand store substituiu os React Contexts sem quebrar nenhuma funcionalidade existente do M5
- [ ] `npm run build` ✓ e `npm run lint` ✓ zero warnings
- [ ] Playwright E2E: seleção de cliente na navbar → "Ordenar por IA" → animação → "✕ Ordenação original" → abrir drawer RAG → enviar mensagem

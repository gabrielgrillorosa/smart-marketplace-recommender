# Concerns — Frontend
**Serviço:** frontend (Next.js 14 / App Router)
**Analisado:** 2026-04-26

---

## Alta Severidade

### C-F01: Dependência implícita entre ClientContext e RecommendationContext
**Arquivo:** `components/client/ClientPanel.tsx` linha 64-67
**Problema:** `handleClientChange()` chama `clearRecommendations()` antes de `setSelectedClient()` — a ordem importa, mas não há nenhuma garantia tipológica ou arquitetural que isso sempre aconteça. Qualquer componente que chame `setSelectedClient` diretamente (ex: um futuro seletor na navbar) esquecerá de limpar as recomendações, deixando o estado inconsistente (recomendações de cliente A visíveis para cliente B).
**Fix:** Mover a lógica de "trocar cliente limpa recomendações" para dentro do próprio `setSelectedClient` no Context, ou migrar para Zustand com dependência explícita entre slices (AD-012 já define isso para M8).
**Impacto para M8:** Bloqueante — M8 adiciona seletor na navbar que chamará `setSelectedClient` em novo ponto de entrada.

### C-F02: Ausência total de testes unitários/componente
**Arquivos:** todos os arquivos em `lib/` e `components/`
**Problema:** Não existe Vitest, Jest ou Testing Library instalado. A lógica em `lib/adapters/recommend.ts` (mapeamento defensivo de múltiplos formatos), `lib/utils/shuffle.ts` (LCG determinístico), e `lib/fetch-wrapper.ts` não tem cobertura de testes. Regressões em adaptadores só são detectadas pelos testes E2E Playwright — que são lentos e requerem todos os serviços rodando.
**Fix:** Instalar Vitest + @testing-library/react; adicionar testes unitários para `lib/adapters/`, `lib/utils/shuffle.ts`, e testes de componente para os contextos.
**Impacto para M8:** O `<ReorderableGrid>` e o Zustand store introduzidos em M8 ficarão sem cobertura unitária se o padrão atual for mantido.

---

## Média Severidade

### C-F03: Seletores E2E frágeis — dependência de texto visível e CSS
**Arquivo:** `e2e/tests/recommend.spec.ts` e demais specs
**Problema:** `page.locator('span.cursor-help')`, `page.locator('select').first()`, `page.locator('nav button:has-text("Cliente")')` — seletores que quebram com qualquer refactor de classes CSS ou texto de label. M8 vai renomear botões e reorganizar a navbar, invalidando vários desses seletores.
**Fix:** Adicionar `data-testid` nos elementos interativos críticos (botões de tab, selects, score badges) e migrar os seletores E2E para `page.getByTestId()`.

### C-F04: Prop drilling latente em CatalogPanel
**Arquivo:** `components/catalog/CatalogPanel.tsx`
**Problema:** `CatalogPanel` gerencia `allProducts`, `filteredProducts`, e estado de busca semântica localmente. M8 adiciona `ordered` (modo Ordenar por IA) e `recommendationScores` como novo estado que precisa vir de fora (do store Zustand ou de uma prop). Sem refactor, CatalogPanel vai acumular 6-7 states locais relacionados mas desconexos.
**Fix:** Avaliar no design do M8 quais states devem ir para o Zustand store e quais permanecem locais ao CatalogPanel.

### C-F05: `apiFetch` sem timeout configurável
**Arquivo:** `lib/fetch-wrapper.ts`
**Problema:** `apiFetch()` não configura `AbortSignal.timeout()`. Apenas `useServiceHealth.ts` usa `AbortSignal.timeout(5000)` manualmente. Chamadas ao RAG (LLM com alta latência) e ao recommend não têm timeout — podem ficar pendentes indefinidamente se o serviço travar.
**Fix:** Adicionar parâmetro `timeout?: number` em `apiFetch()` com default de 60s para RAG e 10s para demais chamadas.

---

## Baixa Severidade

### C-F06: `lucide-react` versão 1.11.0 — pacote recente com API instável
**Arquivo:** `package.json`
**Problema:** `lucide-react@1.11.0` é uma versão major recente. O pacote tem histórico de breaking changes entre minor versions (renaming de ícones). Fixar em `^1.11.0` pode causar surpresas em `npm update`.
**Fix:** Verificar CHANGELOG antes de atualizar; considerar pin em versão exata.

### C-F07: Sem error boundaries — erros de render derrubam toda a página
**Arquivos:** `app/layout.tsx`, painéis individuais
**Problema:** Nenhum `<ErrorBoundary>` envolve os painéis. Um erro de render em `CatalogPanel` (ex: produto com campo null inesperado) vai propagar para o root e mostrar a página de erro do Next.js, quebrando toda a demo.
**Fix:** Adicionar `<ErrorBoundary>` em torno de cada painel principal ou usar o `error.tsx` do App Router por segmento.

### C-F08: `react-markdown` versão 8.0.7 — requer remark plugins para sanitização
**Arquivo:** `components/chat/ChatMessage.tsx` (presumido — usa react-markdown)
**Problema:** `react-markdown` v8 não sanitiza HTML por padrão. Respostas do LLM que contenham HTML raw podem ser renderizadas. Para uma demo pública, isso é risco XSS baixo mas real.
**Fix:** Adicionar `remarkGfm` e confirmar que `rehype-sanitize` ou `allowedElements` prop esteja configurado.

# Testing — Frontend
**Serviço:** frontend (Next.js 14 / App Router)
**Analisado:** 2026-04-26

---

## Frameworks

| Tipo | Framework | Versão |
|---|---|---|
| E2E | Playwright | 1.59.1 |
| Unit/Component | **não instalado** | — |
| Coverage | **não configurado** | — |

## Organização dos testes

- Localização: `e2e/tests/*.spec.ts`
- Configuração: `e2e/playwright.config.ts`
- Base URL: `http://localhost:3000`
- Timeout por teste: 90 segundos
- Screenshots: `only-on-failure` em `e2e/screenshots/`

## Testes E2E existentes

| Arquivo | O que testa |
|---|---|
| `recommend.spec.ts` | Navega para tab Cliente → seleciona cliente → clica "Obter Recomendações" → navega para Recomendações → verifica score cards |
| `search.spec.ts` | Busca semântica no catálogo |
| `rag.spec.ts` | Chat RAG — envia pergunta e verifica resposta |

## Padrões observados nos testes E2E

- `page.goto('/')` + `waitForLoadState('networkidle')`
- Seleção de elementos por texto visível: `page.locator('nav button:has-text("Cliente")')`
- Seleção de elementos por CSS: `page.locator('span.cursor-help')`
- `waitFor({ state: 'detached' })` para aguardar loading desaparecer
- `page.locator('select').first()` — selects nativos (não shadcn)
- Nenhum uso de `data-testid` — dependência de texto visível e seletores CSS frágeis

## Coverage Matrix por camada

| Camada | Tipo de teste | Localização | Comando |
|---|---|---|---|
| Componentes React | **nenhum** | — | — |
| React Contexts | **nenhum** | — | — |
| lib/adapters/ | **nenhum** | — | — |
| lib/fetch-wrapper.ts | **nenhum** | — | — |
| lib/utils/shuffle.ts | **nenhum** | — | — |
| app/api/proxy/* (Route Handlers) | **nenhum** | — | — |
| Fluxos E2E completos | Playwright | `e2e/tests/` | `npm run test:e2e` |

## Parallelism Assessment

| Tipo | Parallel-safe? | Isolamento |
|---|---|---|
| Playwright E2E | Sim (por padrão) | Cada test usa instância de browser isolada |
| Unit (ausente) | N/A | — |

## Gate Check Commands

| Gate | Quando usar | Comando |
|---|---|---|
| Quick | Após mudanças de componente sem E2E | `npm run lint && npm run build` |
| Full | Após feature completa com UI | `npm run lint && npm run build && npm run test:e2e` |
| Build | Fase completa | `npm run lint && npm run build && npm run test:e2e` |

**Nota crítica:** Não existe gate de testes unitários — `npm test` não está definido no `package.json` do frontend. O único comando de teste é `test:e2e`. Qualquer regressão em lógica de adaptadores, contextos ou utilitários só é detectada pelo E2E ou manualmente.

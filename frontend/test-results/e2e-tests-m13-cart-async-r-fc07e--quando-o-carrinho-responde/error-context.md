# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/tests/m13-cart-async-retrain.spec.ts >> M13 — Cart, Checkout & Async Retrain >> fluxo de carrinho recaptura a análise e valida o pós-efetivar quando o carrinho responde
- Location: e2e/tests/m13-cart-async-retrain.spec.ts:137:7

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  40  | 
  41  |   const mobileCheckout = page.getByTestId('cart-checkout-mobile');
  42  |   if (await mobileCheckout.isVisible().catch(() => false)) {
  43  |     return mobileCheckout;
  44  |   }
  45  | 
  46  |   return null;
  47  | }
  48  | 
  49  | async function getVisibleClearButton(page: Page): Promise<Locator | null> {
  50  |   const desktopClear = page.getByTestId('cart-clear');
  51  |   if (await desktopClear.isVisible().catch(() => false)) {
  52  |     return desktopClear;
  53  |   }
  54  | 
  55  |   const mobileClear = page.getByTestId('cart-clear-mobile');
  56  |   if (await mobileClear.isVisible().catch(() => false)) {
  57  |     return mobileClear;
  58  |   }
  59  | 
  60  |   return null;
  61  | }
  62  | 
  63  | async function getCartCaptureTimestamp(page: Page): Promise<string | null> {
  64  |   const cartTime = page.getByTestId('analysis-column-cart').locator('time');
  65  |   const visible = await cartTime.isVisible().catch(() => false);
  66  |   if (!visible) {
  67  |     return null;
  68  |   }
  69  | 
  70  |   return cartTime.getAttribute('datetime');
  71  | }
  72  | 
  73  | async function waitForCartCaptureTimestampChange(page: Page, previousTimestamp: string): Promise<string> {
  74  |   await expect
  75  |     .poll(async () => {
  76  |       const current = await getCartCaptureTimestamp(page);
  77  |       return current && current !== previousTimestamp ? current : null;
  78  |     }, { timeout: 30000 })
  79  |     .not.toBeNull();
  80  | 
  81  |   return (await getCartCaptureTimestamp(page))!;
  82  | }
  83  | 
  84  | async function orderCatalogAndEnableDiagnostic(page: Page): Promise<{ scoredProductId: string }> {
  85  |   await page.waitForSelector('[data-testid="reorderable-item"]', { timeout: 20000 });
  86  | 
  87  |   const catalogCards = page.getByTestId('reorderable-item');
  88  |   const catalogCount = await catalogCards.count();
  89  |   expect(catalogCount).toBeGreaterThan(10);
  90  | 
  91  |   const orderButton = page.getByTestId('catalog-order-ai');
  92  |   await expect(orderButton).toBeVisible({ timeout: 10000 });
  93  |   await orderButton.click();
  94  | 
  95  |   const coverageBanner = page.getByTestId('catalog-coverage-banner');
  96  |   await expect(coverageBanner).toBeVisible({ timeout: 30000 });
  97  |   await expect
  98  |     .poll(async () => page.locator('[data-testid^="catalog-score-"]').count(), { timeout: 30000 })
  99  |     .toBeGreaterThan(10);
  100 |   await expect(coverageBanner).toContainText(/produtos visíveis receberam score/i);
  101 |   await expect(coverageBanner).toContainText(/fora da cobertura atual/i);
  102 | 
  103 |   const diagnosticButton = page.getByTestId('catalog-order-diagnostic');
  104 |   await expect(diagnosticButton).toBeVisible({ timeout: 10000 });
  105 |   await diagnosticButton.click();
  106 |   await expect(coverageBanner).toContainText(/modo diagnóstico/i, { timeout: 30000 });
  107 | 
  108 |   const firstScoredBadge = page.locator('[data-testid^="catalog-score-"]').first();
  109 |   const firstScoredBadgeTestId = await firstScoredBadge.getAttribute('data-testid');
  110 |   test.skip(!firstScoredBadgeTestId, 'Nenhum card com score foi encontrado para validar a cobertura do catálogo.');
  111 | 
  112 |   return {
  113 |     scoredProductId: firstScoredBadgeTestId!.replace('catalog-score-', ''),
  114 |   };
  115 | }
  116 | 
  117 | test.describe('M13 — Cart, Checkout & Async Retrain', () => {
  118 |   test('catálogo ordenado expõe cobertura explícita e resumo de score no modal', async ({ page }) => {
  119 |     test.setTimeout(120000);
  120 | 
  121 |     await page.goto('/');
  122 |     await page.waitForLoadState('networkidle');
  123 | 
  124 |     const clientSelected = await selectFirstClient(page);
  125 |     test.skip(!clientSelected, 'Sem clientes disponiveis no ambiente E2E atual.');
  126 | 
  127 |     const { scoredProductId } = await orderCatalogAndEnableDiagnostic(page);
  128 | 
  129 |     await page.getByTestId(`catalog-product-card-${scoredProductId}`).click();
  130 |     const modalScoreSummary = page.getByTestId('product-detail-score-summary');
  131 |     await expect(modalScoreSummary).toBeVisible({ timeout: 10000 });
  132 |     await expect(modalScoreSummary).toContainText(/Score final|Neural|Semântico/);
  133 |     await page.keyboard.press('Escape');
  134 |     await expect(modalScoreSummary).toHaveCount(0);
  135 |   });
  136 | 
  137 |   test('fluxo de carrinho recaptura a análise e valida o pós-efetivar quando o carrinho responde', async ({ page }) => {
  138 |     test.setTimeout(180000);
  139 | 
> 140 |     await page.goto('/');
      |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  141 |     await page.waitForLoadState('networkidle');
  142 | 
  143 |     const firstClientId = await page.evaluate(async () => {
  144 |       const response = await fetch('/backend/api/v1/clients?size=1', { cache: 'no-store' });
  145 |       if (!response.ok) return null;
  146 |       const payload = await response.json();
  147 |       const items = Array.isArray(payload?.items) ? payload.items : [];
  148 |       return items[0]?.id ?? null;
  149 |     });
  150 |     if (firstClientId) {
  151 |       await page.evaluate(async (id) => {
  152 |         await fetch(`/api/proxy/carts/${id}`, { method: 'DELETE' }).catch(() => {});
  153 |       }, firstClientId);
  154 |     }
  155 | 
  156 |     const clientSelected = await selectFirstClient(page);
  157 |     test.skip(!clientSelected, 'Sem clientes disponiveis no ambiente E2E atual.');
  158 | 
  159 |     await orderCatalogAndEnableDiagnostic(page);
  160 | 
  161 |     const addButton = page.locator('[data-testid^="catalog-add-cart-"]:not([disabled])').first();
  162 |     const hasAddButton = await addButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  163 |     test.skip(!hasAddButton, 'Nenhum botao de adicionar ao carrinho foi encontrado.');
  164 | 
  165 |     const addButtonTestId = await addButton.getAttribute('data-testid');
  166 |     test.skip(!addButtonTestId, 'Nao foi possivel identificar o produto para validacao do carrinho.');
  167 |     const productId = addButtonTestId!.replace('catalog-add-cart-', '');
  168 | 
  169 |     await addButton.scrollIntoViewIfNeeded();
  170 |     await addButton.click();
  171 | 
  172 |     const removeButton = page.getByTestId(`catalog-remove-cart-${productId}`);
  173 |     const removeVisible = await removeButton.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  174 |     test.skip(!removeVisible, 'Cart backend indisponível no ambiente atual para validar o fluxo de carrinho.');
  175 | 
  176 |     const cartSummaryDesktop = page.getByTestId('cart-summary-desktop');
  177 |     if (await cartSummaryDesktop.isVisible().catch(() => false)) {
  178 |       await expect(cartSummaryDesktop).toContainText(/item\(ns\)|Carrinho/);
  179 |     }
  180 | 
  181 |     await openAnalysisTab(page);
  182 | 
  183 |     const cartColumn = page.getByTestId('analysis-column-cart');
  184 |     await expect(cartColumn.locator('li').first()).toBeVisible({ timeout: 30000 });
  185 |     await expect
  186 |       .poll(async () => page.locator('[data-testid^="analysis-column-cart-delta-"]').count(), { timeout: 30000 })
  187 |       .toBeGreaterThan(0);
  188 | 
  189 |     const firstCartTimestamp = await getCartCaptureTimestamp(page);
  190 |     expect(firstCartTimestamp).not.toBeNull();
  191 | 
  192 |     await openCatalogTab(page);
  193 | 
  194 |     const secondAddButton = page.locator('[data-testid^="catalog-add-cart-"]').first();
  195 |     const secondAddButtonTestId = await secondAddButton.getAttribute('data-testid');
  196 |     test.skip(!secondAddButtonTestId, 'Nao foi possivel identificar o segundo produto do carrinho.');
  197 |     const secondProductId = secondAddButtonTestId!.replace('catalog-add-cart-', '');
  198 | 
  199 |     await secondAddButton.click();
  200 |     await expect(page.getByTestId(`catalog-remove-cart-${secondProductId}`)).toBeVisible({ timeout: 10000 });
  201 | 
  202 |     await openAnalysisTab(page);
  203 |     const secondCartTimestamp = await waitForCartCaptureTimestampChange(page, firstCartTimestamp!);
  204 | 
  205 |     await openCatalogTab(page);
  206 |     await page.getByTestId(`catalog-remove-cart-${secondProductId}`).click();
  207 | 
  208 |     await openAnalysisTab(page);
  209 |     await waitForCartCaptureTimestampChange(page, secondCartTimestamp);
  210 | 
  211 |     await openCatalogTab(page);
  212 |     const clearButton = await getVisibleClearButton(page);
  213 |     test.skip(!clearButton, 'Acao de esvaziar carrinho indisponivel na viewport atual.');
  214 |     await clearButton!.click();
  215 | 
  216 |     await openAnalysisTab(page);
  217 |     await expect(cartColumn).toContainText('Adicione itens ao carrinho no catálogo');
  218 |     await expect(cartColumn.locator('time')).toHaveCount(0);
  219 |     await expect(page.locator('[data-testid^="analysis-column-cart-delta-"]')).toHaveCount(0);
  220 | 
  221 |     await openCatalogTab(page);
  222 |     const reAddFirstButton = page.getByTestId(`catalog-add-cart-${productId}`);
  223 |     await expect(reAddFirstButton).toBeVisible({ timeout: 10000 });
  224 |     await reAddFirstButton.click();
  225 | 
  226 |     const checkoutButton = await getVisibleCheckoutButton(page);
  227 |     test.skip(!checkoutButton, 'Checkout nao disponivel na viewport atual.');
  228 |     await checkoutButton!.click();
  229 | 
  230 |     await expect(page.getByTestId(`catalog-remove-cart-${productId}`)).toHaveCount(0, { timeout: 20000 });
  231 |     if (await cartSummaryDesktop.isVisible().catch(() => false)) {
  232 |       await expect(cartSummaryDesktop).toContainText('Carrinho vazio', { timeout: 20000 });
  233 |     }
  234 | 
  235 |     await openAnalysisTab(page);
  236 | 
  237 |     const modelStatusPanel = page.getByTestId('model-status-panel');
  238 |     await expect(modelStatusPanel).toBeVisible({ timeout: 10000 });
  239 |     await expect(modelStatusPanel).toContainText(
  240 |       /Pedido confirmado, modelo aprendendo|Pos-Efetivar já reflete a nova versão ativa|Modelo atual mantido após o checkout|Treinamento pós-checkout não concluiu|Resultado do checkout ainda sem confirmação/,
```
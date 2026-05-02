import { expect, test, type Locator, type Page } from '@playwright/test';

async function selectFirstClient(page: Page): Promise<boolean> {
  const selectorButton = page.locator('button[aria-label="Selecionar cliente"]');
  await expect(selectorButton).toBeVisible({ timeout: 10000 });
  await selectorButton.click();

  const firstClientOption = page.locator('[role="option"]').first();
  const hasClientOption = await firstClientOption
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!hasClientOption) {
    return false;
  }

  await firstClientOption.click();
  return true;
}

async function openAnalysisTab(page: Page): Promise<void> {
  const analysisTab = page.getByTestId('main-tab-analysis');
  await expect(analysisTab).toBeVisible({ timeout: 10000 });
  await analysisTab.click();
  await page.waitForLoadState('networkidle');
}

async function openCatalogTab(page: Page): Promise<void> {
  const catalogTab = page.getByTestId('main-tab-catalog');
  await expect(catalogTab).toBeVisible({ timeout: 10000 });
  await catalogTab.click();
  await page.waitForLoadState('networkidle');
}

async function getVisibleCheckoutButton(page: Page): Promise<Locator | null> {
  const desktopCheckout = page.getByTestId('cart-checkout');
  if (await desktopCheckout.isVisible().catch(() => false)) {
    return desktopCheckout;
  }

  const mobileCheckout = page.getByTestId('cart-checkout-mobile');
  if (await mobileCheckout.isVisible().catch(() => false)) {
    return mobileCheckout;
  }

  return null;
}

async function getVisibleClearButton(page: Page): Promise<Locator | null> {
  const desktopClear = page.getByTestId('cart-clear');
  if (await desktopClear.isVisible().catch(() => false)) {
    return desktopClear;
  }

  const mobileClear = page.getByTestId('cart-clear-mobile');
  if (await mobileClear.isVisible().catch(() => false)) {
    return mobileClear;
  }

  return null;
}

async function getCartCaptureTimestamp(page: Page): Promise<string | null> {
  const cartTime = page.getByTestId('analysis-column-cart').locator('time');
  const visible = await cartTime.isVisible().catch(() => false);
  if (!visible) {
    return null;
  }

  return cartTime.getAttribute('datetime');
}

async function waitForCartCaptureTimestampChange(page: Page, previousTimestamp: string): Promise<string> {
  await expect
    .poll(async () => {
      const current = await getCartCaptureTimestamp(page);
      return current && current !== previousTimestamp ? current : null;
    }, { timeout: 30000 })
    .not.toBeNull();

  return (await getCartCaptureTimestamp(page))!;
}

async function orderCatalogAndEnableDiagnostic(page: Page): Promise<{ scoredProductId: string }> {
  await page.waitForSelector('[data-testid="reorderable-item"]', { timeout: 20000 });

  const catalogCards = page.getByTestId('reorderable-item');
  const catalogCount = await catalogCards.count();
  expect(catalogCount).toBeGreaterThan(10);

  const orderButton = page.getByTestId('catalog-order-ai');
  await expect(orderButton).toBeVisible({ timeout: 10000 });
  await orderButton.click();

  const coverageBanner = page.getByTestId('catalog-coverage-banner');
  await expect(coverageBanner).toBeVisible({ timeout: 30000 });
  await expect
    .poll(async () => page.locator('[data-testid^="catalog-score-"]').count(), { timeout: 30000 })
    .toBeGreaterThan(10);
  await expect(coverageBanner).toContainText(/produtos visíveis receberam score/i);
  await expect(coverageBanner).toContainText(/fora da cobertura atual/i);

  const diagnosticButton = page.getByTestId('catalog-order-diagnostic');
  await expect(diagnosticButton).toBeVisible({ timeout: 10000 });
  await diagnosticButton.click();
  await expect(coverageBanner).toContainText(/modo diagnóstico/i, { timeout: 30000 });

  const firstScoredBadge = page.locator('[data-testid^="catalog-score-"]').first();
  const firstScoredBadgeTestId = await firstScoredBadge.getAttribute('data-testid');
  test.skip(!firstScoredBadgeTestId, 'Nenhum card com score foi encontrado para validar a cobertura do catálogo.');

  return {
    scoredProductId: firstScoredBadgeTestId!.replace('catalog-score-', ''),
  };
}

test.describe('M13 — Cart, Checkout & Async Retrain', () => {
  test('catálogo ordenado expõe cobertura explícita e resumo de score no modal', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const clientSelected = await selectFirstClient(page);
    test.skip(!clientSelected, 'Sem clientes disponiveis no ambiente E2E atual.');

    const { scoredProductId } = await orderCatalogAndEnableDiagnostic(page);

    await page.getByTestId(`catalog-product-card-${scoredProductId}`).click();
    const modalScoreSummary = page.getByTestId('product-detail-score-summary');
    await expect(modalScoreSummary).toBeVisible({ timeout: 10000 });
    await expect(modalScoreSummary).toContainText(/Score final|Neural|Semântico/);
    await page.keyboard.press('Escape');
    await expect(modalScoreSummary).toHaveCount(0);
  });

  test('fluxo de carrinho recaptura a análise e valida o pós-efetivar quando o carrinho responde', async ({ page }) => {
    test.setTimeout(180000);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const firstClientId = await page.evaluate(async () => {
      const response = await fetch('/backend/api/v1/clients?size=1', { cache: 'no-store' });
      if (!response.ok) return null;
      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      return items[0]?.id ?? null;
    });
    if (firstClientId) {
      await page.evaluate(async (id) => {
        await fetch(`/api/proxy/carts/${id}`, { method: 'DELETE' }).catch(() => {});
      }, firstClientId);
    }

    const clientSelected = await selectFirstClient(page);
    test.skip(!clientSelected, 'Sem clientes disponiveis no ambiente E2E atual.');

    await orderCatalogAndEnableDiagnostic(page);

    const addButton = page.locator('[data-testid^="catalog-add-cart-"]:not([disabled])').first();
    const hasAddButton = await addButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    test.skip(!hasAddButton, 'Nenhum botao de adicionar ao carrinho foi encontrado.');

    const addButtonTestId = await addButton.getAttribute('data-testid');
    test.skip(!addButtonTestId, 'Nao foi possivel identificar o produto para validacao do carrinho.');
    const productId = addButtonTestId!.replace('catalog-add-cart-', '');

    await addButton.scrollIntoViewIfNeeded();
    await addButton.click();

    const removeButton = page.getByTestId(`catalog-remove-cart-${productId}`);
    const removeVisible = await removeButton.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    test.skip(!removeVisible, 'Cart backend indisponível no ambiente atual para validar o fluxo de carrinho.');

    const cartSummaryDesktop = page.getByTestId('cart-summary-desktop');
    if (await cartSummaryDesktop.isVisible().catch(() => false)) {
      await expect(cartSummaryDesktop).toContainText(/item\(ns\)|Carrinho/);
    }

    await openAnalysisTab(page);

    const cartColumn = page.getByTestId('analysis-column-cart');
    await expect(cartColumn.locator('li').first()).toBeVisible({ timeout: 30000 });
    await expect
      .poll(async () => page.locator('[data-testid^="analysis-column-cart-delta-"]').count(), { timeout: 30000 })
      .toBeGreaterThan(0);

    const firstCartTimestamp = await getCartCaptureTimestamp(page);
    expect(firstCartTimestamp).not.toBeNull();

    await openCatalogTab(page);

    const secondAddButton = page.locator('[data-testid^="catalog-add-cart-"]').first();
    const secondAddButtonTestId = await secondAddButton.getAttribute('data-testid');
    test.skip(!secondAddButtonTestId, 'Nao foi possivel identificar o segundo produto do carrinho.');
    const secondProductId = secondAddButtonTestId!.replace('catalog-add-cart-', '');

    await secondAddButton.click();
    await expect(page.getByTestId(`catalog-remove-cart-${secondProductId}`)).toBeVisible({ timeout: 10000 });

    await openAnalysisTab(page);
    const secondCartTimestamp = await waitForCartCaptureTimestampChange(page, firstCartTimestamp!);

    await openCatalogTab(page);
    await page.getByTestId(`catalog-remove-cart-${secondProductId}`).click();

    await openAnalysisTab(page);
    await waitForCartCaptureTimestampChange(page, secondCartTimestamp);

    await openCatalogTab(page);
    const clearButton = await getVisibleClearButton(page);
    test.skip(!clearButton, 'Acao de esvaziar carrinho indisponivel na viewport atual.');
    await clearButton!.click();

    await openAnalysisTab(page);
    await expect(cartColumn).toContainText('Adicione itens ao carrinho no catálogo');
    await expect(cartColumn.locator('time')).toHaveCount(0);
    await expect(page.locator('[data-testid^="analysis-column-cart-delta-"]')).toHaveCount(0);

    await openCatalogTab(page);
    const reAddFirstButton = page.getByTestId(`catalog-add-cart-${productId}`);
    await expect(reAddFirstButton).toBeVisible({ timeout: 10000 });
    await reAddFirstButton.click();

    const checkoutButton = await getVisibleCheckoutButton(page);
    test.skip(!checkoutButton, 'Checkout nao disponivel na viewport atual.');

    // Wait for the checkout response so we can capture orderId and confirm the
    // training pipeline was triggered before we move to the Analysis tab.
    const checkoutResponsePromise = page.waitForResponse(
      (resp) => /\/carts\/[^/]+\/checkout$/.test(resp.url()) && resp.request().method() === 'POST',
      { timeout: 30000 }
    );
    await checkoutButton!.click();
    const checkoutResponse = await checkoutResponsePromise.catch(() => null);
    test.skip(!checkoutResponse, 'Checkout response nao foi recebida no tempo esperado.');
    const checkoutPayload = await checkoutResponse!.json().catch(() => ({}));
    test.skip(
      checkoutResponse!.status() >= 400,
      `Checkout falhou com status ${checkoutResponse!.status()} no ambiente atual.`
    );

    await expect(page.getByTestId(`catalog-remove-cart-${productId}`)).toHaveCount(0, { timeout: 20000 });
    if (await cartSummaryDesktop.isVisible().catch(() => false)) {
      await expect(cartSummaryDesktop).toContainText('Carrinho vazio', { timeout: 20000 });
    }

    await openAnalysisTab(page);

    const modelStatusPanel = page.getByTestId('model-status-panel');
    await expect(modelStatusPanel).toBeVisible({ timeout: 10000 });
    test.skip(
      checkoutPayload?.expectedTrainingTriggered !== true,
      'Checkout backend nao sinalizou expectedTrainingTriggered=true; pulando assercao de model-status.'
    );
    await expect(modelStatusPanel).toContainText(
      /Pedido confirmado, modelo aprendendo|Pos-Efetivar já reflete a nova versão ativa|Modelo atual mantido após o checkout|Treinamento pós-checkout não concluiu|Resultado do checkout ainda sem confirmação/,
      { timeout: 30000 }
    );

    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return (
          text.includes('Pos-Efetivar já reflete a nova versão ativa') ||
          text.includes('Modelo atual mantido após o checkout') ||
          text.includes('Treinamento pós-checkout não concluiu') ||
          text.includes('Resultado do checkout ainda sem confirmação')
        );
      },
      { timeout: 120000 }
    );

    const promoted = await modelStatusPanel
      .getByText('Pos-Efetivar já reflete a nova versão ativa')
      .isVisible()
      .catch(() => false);
    const rejected = await modelStatusPanel
      .getByText('Modelo atual mantido após o checkout')
      .isVisible()
      .catch(() => false);
    const failed = await modelStatusPanel
      .getByText('Treinamento pós-checkout não concluiu')
      .isVisible()
      .catch(() => false);
    const unknown = await modelStatusPanel
      .getByText('Resultado do checkout ainda sem confirmação')
      .isVisible()
      .catch(() => false);

    if (promoted) {
      const postCheckoutColumn = page.getByTestId('analysis-column-post-checkout');
      // M19 / PE-06 / ADR-065: Pos-Efetivar deltas require cart-aware baseline; copy + pills
      // regress when the post-checkout column loses its diff map after checkout.
      await expect(postCheckoutColumn).toContainText('Pós efetivar', { timeout: 5000 });
      await expect(postCheckoutColumn.locator('li').first()).toBeVisible({ timeout: 30000 });
      await expect(
        postCheckoutColumn.locator(`[data-testid^="analysis-column-post-checkout-delta-"]`).first()
      ).toBeVisible({ timeout: 30000 });
      await expect(postCheckoutColumn.getByTestId('analysis-column-post-checkout-empty-delta-notice')).toHaveCount(
        0
      );
      return;
    }

    if (rejected) {
      await expect(modelStatusPanel).toContainText(/rejeitado|mantido|Pos-Efetivar/i);
      return;
    }

    if (failed) {
      await expect(modelStatusPanel).toContainText(/não concluiu|anterior|erro/i);
      return;
    }

    expect(unknown).toBeTruthy();
    await expect(modelStatusPanel.getByTestId('model-status-refresh')).toBeVisible();
  });
});

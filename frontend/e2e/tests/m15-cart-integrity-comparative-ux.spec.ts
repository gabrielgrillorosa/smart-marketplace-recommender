import { expect, test, type Page } from '@playwright/test';

interface ClientOption {
  id: string;
  name: string;
  segment: string;
  countryCode: string;
}

interface ProductOption {
  id: string;
  name: string;
  availableCountries: string[];
}

function buildPersistedState(state: Record<string, unknown> | null) {
  if (!state) {
    return null;
  }

  return { state, version: 0 };
}

async function boot(page: Page, persistedState: Record<string, unknown> | null = null): Promise<void> {
  const storageValue = buildPersistedState(persistedState);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate((value) => {
    window.localStorage.clear();
    if (value) {
      window.localStorage.setItem('smr-client', JSON.stringify(value));
    }
  }, storageValue);
  await page.reload({ waitUntil: 'networkidle' });
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

async function selectClientByName(page: Page, clientName: string): Promise<void> {
  const selectorButton = page.locator('button[aria-label="Selecionar cliente"]');
  await expect(selectorButton).toBeVisible({ timeout: 10000 });
  await selectorButton.click();

  const option = page.locator('[role="option"]').filter({ hasText: clientName }).first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
}

async function selectFirstClient(page: Page): Promise<boolean> {
  const selectorButton = page.locator('button[aria-label="Selecionar cliente"]');
  await expect(selectorButton).toBeVisible({ timeout: 10000 });
  await selectorButton.click();

  const firstClientOption = page.locator('[role="option"]').first();
  const hasClientOption = await firstClientOption.isVisible({ timeout: 20000 }).catch(() => false);
  if (!hasClientOption) {
    return false;
  }

  await firstClientOption.click();
  return true;
}

async function fetchCatalogContext(page: Page): Promise<{ clients: ClientOption[]; products: ProductOption[] }> {
  return page.evaluate(async () => {
    const unwrap = (payload: unknown): any[] => {
      if (Array.isArray(payload)) {
        return payload;
      }

      if (payload && typeof payload === 'object') {
        const pageLike = payload as { items?: unknown[]; content?: unknown[] };
        return pageLike.items ?? pageLike.content ?? [];
      }

      return [];
    };

    const [clientsPayload, productsPayload] = await Promise.all([
      fetch('/backend/api/v1/clients?size=100', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/backend/api/v1/products?size=100', { cache: 'no-store' }).then((response) => response.json()),
    ]);

    const clients = unwrap(clientsPayload).map((client) => ({
      id: String(client.id),
      name: String(client.name),
      segment: String(client.segment),
      countryCode: String(client.countryCode),
    }));

    const products = unwrap(productsPayload).map((product) => ({
      id: String(product.id),
      name: String(product.name),
      availableCountries: Array.isArray(product.availableCountries)
        ? product.availableCountries.map(String)
        : Array.isArray(product.countries)
          ? product.countries.map(String)
          : [],
    }));

    return { clients, products };
  });
}

async function findProfileFixtures(page: Page): Promise<{
  withHistory: { client: ClientOption; totalOrders: number };
  fallbackClient: { client: ClientOption };
}> {
  return page.evaluate(async () => {
    const unwrap = (payload: unknown): any[] => {
      if (Array.isArray(payload)) {
        return payload;
      }

      if (payload && typeof payload === 'object') {
        const pageLike = payload as { items?: unknown[]; content?: unknown[] };
        return pageLike.items ?? pageLike.content ?? [];
      }

      return [];
    };

    const clientsPayload = await fetch('/backend/api/v1/clients?size=100', { cache: 'no-store' }).then((response) =>
      response.json()
    );
    const clients = unwrap(clientsPayload).map((client) => ({
      id: String(client.id),
      name: String(client.name),
      segment: String(client.segment),
      countryCode: String(client.countryCode),
    }));

    let withHistory: { client: ClientOption; totalOrders: number } | null = null;

    for (const client of clients) {
      const detail = await fetch(`/backend/api/v1/clients/${client.id}`, { cache: 'no-store' }).then((response) =>
        response.json()
      );
      const totalOrders = Number(detail.purchaseSummary?.totalOrders ?? 0);

      if (!withHistory && totalOrders > 0) {
        withHistory = { client, totalOrders };
      }

      if (withHistory) {
        break;
      }
    }

    if (!withHistory) {
      throw new Error('Não foi possível encontrar um cliente com histórico para o E2E do M15.');
    }

    const fallbackClient = clients.find((client) => client.id !== withHistory.client.id);
    if (!fallbackClient) {
      throw new Error('Não foi possível encontrar um segundo cliente para simular o estado vazio no E2E do M15.');
    }

    return { withHistory, fallbackClient: { client: fallbackClient } };
  });
}

async function expectNoPostCheckoutSnapshot(page: Page): Promise<void> {
  const postCheckoutColumn = page.getByTestId('analysis-column-post-checkout');
  await expect(postCheckoutColumn.locator('li')).toHaveCount(0);
}

async function clearBackendCart(page: Page, clientId: string): Promise<void> {
  await page.evaluate(async (id) => {
    await fetch(`/api/proxy/carts/${id}`, { method: 'DELETE' }).catch(() => {});
  }, clientId);
}

test.describe('M15 — Cart Integrity & Comparative UX', () => {
  test('bloqueia produto incompatível, propaga a mensagem do backend e mantém add compatível funcional', async ({
    page,
  }) => {
    test.setTimeout(120000);

    await boot(page);

    const { clients, products } = await fetchCatalogContext(page);
    const fixture = clients
      .map((client) => ({
        client,
        incompatibleProduct: products.find(
          (product) => !product.availableCountries.includes(client.countryCode)
        ),
        compatibleProduct: products.find((product) => product.availableCountries.includes(client.countryCode)),
      }))
      .find((candidate) => candidate.incompatibleProduct && candidate.compatibleProduct);

    test.skip(!fixture, 'Não foi encontrado um par cliente/produto compatível e incompatível no catálogo atual.');

    await clearBackendCart(page, fixture!.client.id);
    await selectClientByName(page, fixture!.client.name);

    const incompatibleButton = page.getByTestId(`catalog-add-cart-${fixture!.incompatibleProduct!.id}`);
    await incompatibleButton.scrollIntoViewIfNeeded();
    await expect(incompatibleButton).toBeVisible({ timeout: 10000 });
    await expect(incompatibleButton).toBeDisabled();

    const disabledReason = page.locator(`#catalog-add-cart-reason-${fixture!.incompatibleProduct!.id}`);
    await expect(disabledReason).toBeVisible();
    await expect(disabledReason).toContainText(new RegExp(`Indisponível.*${fixture!.client.countryCode}`, 'i'));

    const backendMessage = `Product ${fixture!.incompatibleProduct!.name} is not available in country ${fixture!.client.countryCode}`;
    const forcedAddResponse = await page.evaluate(
      async ({ clientId, productId }) => {
        const response = await fetch(`/api/proxy/carts/${clientId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, quantity: 1 }),
        });
        const body = await response.json();
        return { status: response.status, body };
      },
      {
        clientId: fixture!.client.id,
        productId: fixture!.incompatibleProduct!.id,
      }
    );

    expect(forcedAddResponse.status).toBe(422);
    expect(forcedAddResponse.body.message).toBe(backendMessage);
    await expect(page.getByTestId(`catalog-remove-cart-${fixture!.incompatibleProduct!.id}`)).toHaveCount(0);

    const compatibleButton = page.getByTestId(`catalog-add-cart-${fixture!.compatibleProduct!.id}`);
    await compatibleButton.scrollIntoViewIfNeeded();
    await compatibleButton.click();
    await expect(page.getByTestId(`catalog-remove-cart-${fixture!.compatibleProduct!.id}`)).toBeVisible({
      timeout: 10000,
    });
  });

  test('renderiza loading, dados reais e estado vazio verdadeiro no ClientProfileCard', async ({ page }) => {
    test.setTimeout(120000);

    await boot(page);

    const fixtures = await findProfileFixtures(page);
    const mockedEmptyClient = fixtures.fallbackClient.client;

    await page.route(`**/backend/api/v1/clients/${fixtures.withHistory.client.id}`, async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ response, body });
    });

    await page.route(`**/backend/api/v1/clients/${fixtures.withHistory.client.id}/orders*`, async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ response, body });
    });

    await openAnalysisTab(page);
    await selectClientByName(page, fixtures.withHistory.client.name);

    await expect(page.getByTestId('client-profile-loading')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('client-profile-total-orders')).toHaveText(
      String(fixtures.withHistory.totalOrders),
      { timeout: 15000 }
    );
    await expect(page.getByTestId('client-profile-total-spent')).toContainText('R$');
    await expect(page.getByTestId('client-profile-last-order-at')).not.toHaveText('Indisponível');
    await expect(page.getByTestId('client-profile-recent-products')).toBeVisible({ timeout: 10000 });

    await page.route(`**/backend/api/v1/clients/${mockedEmptyClient.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: mockedEmptyClient.id,
          name: mockedEmptyClient.name,
          segment: mockedEmptyClient.segment,
          countryCode: mockedEmptyClient.countryCode,
          purchaseSummary: {
            totalOrders: 0,
            totalItems: 0,
            totalSpent: 0,
            lastOrderAt: null,
          },
        }),
      });
    });

    await page.route(`**/backend/api/v1/clients/${mockedEmptyClient.id}/orders*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          page: 0,
          size: 10,
          totalItems: 0,
          totalPages: 0,
        }),
      });
    });

    await selectClientByName(page, mockedEmptyClient.name);
    await expect(page.getByTestId('client-profile-total-orders')).toHaveText('0', { timeout: 15000 });
    await expect(page.getByTestId('client-profile-last-order-at')).toHaveText('Sem pedidos');
    await expect(page.getByText('Sem pedidos registrados')).toBeVisible();
  });

  test('descarta respostas stale ao trocar rapidamente de cliente', async ({ page }) => {
    test.setTimeout(120000);

    await boot(page);

    const { clients } = await fetchCatalogContext(page);
    test.skip(clients.length < 2, 'É necessário pelo menos dois clientes para validar o descarte de respostas stale.');

    const firstClient = clients[0];
    const secondClient = clients[1];

    await page.route(`**/backend/api/v1/clients/${firstClient.id}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: firstClient.id,
          name: firstClient.name,
          segment: firstClient.segment,
          countryCode: firstClient.countryCode,
          purchaseSummary: {
            totalOrders: 99,
            totalItems: 99,
            totalSpent: 9999,
            lastOrderAt: '2026-04-28T10:00:00.000Z',
          },
        }),
      });
    });

    await page.route(`**/backend/api/v1/clients/${firstClient.id}/orders*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'order-old',
              orderDate: '2026-04-28T10:00:00.000Z',
              total: 9999,
              items: [
                {
                  productId: 'old-product',
                  productName: 'Produto antigo',
                  quantity: 1,
                  unitPrice: 9999,
                },
              ],
            },
          ],
          page: 0,
          size: 10,
          totalItems: 1,
          totalPages: 1,
        }),
      });
    });

    await page.route(`**/backend/api/v1/clients/${secondClient.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: secondClient.id,
          name: secondClient.name,
          segment: secondClient.segment,
          countryCode: secondClient.countryCode,
          purchaseSummary: {
            totalOrders: 1,
            totalItems: 3,
            totalSpent: 120,
            lastOrderAt: '2026-04-28T11:00:00.000Z',
          },
        }),
      });
    });

    await page.route(`**/backend/api/v1/clients/${secondClient.id}/orders*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'order-current',
              orderDate: '2026-04-28T11:00:00.000Z',
              total: 120,
              items: [
                {
                  productId: 'current-product',
                  productName: 'Produto atual',
                  quantity: 3,
                  unitPrice: 40,
                },
              ],
            },
          ],
          page: 0,
          size: 10,
          totalItems: 1,
          totalPages: 1,
        }),
      });
    });

    await openAnalysisTab(page);
    await selectClientByName(page, firstClient.name);
    await selectClientByName(page, secondClient.name);

    await expect(page.getByTestId('client-profile-total-orders')).toHaveText('1', { timeout: 15000 });
    await expect(page.getByText('Produto atual')).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(1500);
    await expect(page.getByTestId('client-profile-total-orders')).toHaveText('1');
    await expect(page.getByText('Produto antigo')).toHaveCount(0);
  });

  test('explica com clareza o estado rejeitado no painel e em Pos-Efetivar', async ({ page }) => {
    test.setTimeout(120000);

    await page.route('**/api/proxy/model/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currentVersion: 'v1',
          lastTrainingResult: 'rejected',
          lastDecision: {
            accepted: false,
            reason: 'candidatePrecisionAt5 abaixo da banda de tolerância',
            currentPrecisionAt5: 0.55,
            candidatePrecisionAt5: 0.51,
            tolerance: 0.02,
            currentVersion: 'v1',
          },
        }),
      });
    });

    await boot(page);
    await openAnalysisTab(page);

    const clientSelected = await selectFirstClient(page);
    test.skip(!clientSelected, 'Sem clientes disponíveis no ambiente E2E atual.');

    const modelStatusPanel = page.getByTestId('model-status-panel');
    await expect(modelStatusPanel).toContainText('Modelo atual mantido após o checkout', { timeout: 15000 });
    await expect(modelStatusPanel).toContainText(/rejeitado|Pos-Efetivar/i);

    const outcomeNotice = page.getByTestId('post-checkout-outcome-notice');
    await expect(outcomeNotice).toBeVisible({ timeout: 10000 });
    await expect(outcomeNotice).toContainText('Modelo atual mantido após o checkout');
    await expect(outcomeNotice).toContainText(/ausência de mudança visível é esperada/i);

    await expectNoPostCheckoutSnapshot(page);
    await expect(page.getByTestId('analysis-column-post-checkout')).toContainText(
      'Sem novo ranking visível: o modelo atual foi mantido.'
    );
  });

  test('explica com clareza o estado de falha no painel e em Pos-Efetivar', async ({ page }) => {
    test.setTimeout(120000);

    await page.route('**/api/proxy/model/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currentVersion: 'v1',
          lastTrainingResult: 'failed',
        }),
      });
    });

    await boot(page);
    await openAnalysisTab(page);

    const clientSelected = await selectFirstClient(page);
    test.skip(!clientSelected, 'Sem clientes disponíveis no ambiente E2E atual.');

    const modelStatusPanel = page.getByTestId('model-status-panel');
    await expect(modelStatusPanel).toContainText('Treinamento pós-checkout não concluiu', { timeout: 15000 });
    await expect(modelStatusPanel).toContainText(/Pos-Efetivar continua representando o modelo ativo anterior/i);

    const outcomeNotice = page.getByTestId('post-checkout-outcome-notice');
    await expect(outcomeNotice).toBeVisible({ timeout: 10000 });
    await expect(outcomeNotice).toContainText('Nenhum novo snapshot pós-checkout aplicado');

    await expectNoPostCheckoutSnapshot(page);
    await expect(page.getByTestId('analysis-column-post-checkout')).toContainText(
      'Sem novo snapshot: o retreinamento pós-checkout não concluiu.'
    );
  });

  test('explica com clareza o estado indefinido com affordance de refresh manual', async ({ page }) => {
    test.setTimeout(120000);

    await page.route('**/api/proxy/model/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currentVersion: 'v1',
        }),
      });
    });

    await boot(page);
    const { clients } = await fetchCatalogContext(page);
    test.skip(clients.length === 0, 'Sem clientes disponíveis no ambiente E2E atual.');

    const persistedClient = clients[0];
    await boot(page, {
      selectedClient: {
        id: persistedClient.id,
        name: persistedClient.name,
        segment: persistedClient.segment,
        country: persistedClient.countryCode,
      },
      awaitingRetrainSince: Date.now() - 91_000,
      lastObservedVersion: 'v1',
      awaitingForOrderId: 'pedido-teste-123',
    });
    await openAnalysisTab(page);

    const modelStatusPanel = page.getByTestId('model-status-panel');
    await expect(modelStatusPanel).toContainText('Resultado do checkout ainda sem confirmação', { timeout: 15000 });
    await expect(modelStatusPanel.getByTestId('model-status-refresh')).toBeVisible();

    const outcomeNotice = page.getByTestId('post-checkout-outcome-notice');
    await expect(outcomeNotice).toBeVisible({ timeout: 10000 });
    await expect(outcomeNotice).toContainText('Resultado do retreinamento ainda não confirmado');
    await expect(page.getByTestId('post-checkout-outcome-refresh')).toBeVisible();

    await expectNoPostCheckoutSnapshot(page);
    await expect(page.getByTestId('analysis-column-post-checkout')).toContainText(
      'Aguardando confirmação do resultado pós-checkout.'
    );
  });
});

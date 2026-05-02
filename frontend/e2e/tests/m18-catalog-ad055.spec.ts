import { test, expect } from '@playwright/test';

test('M18 — no vitrine/ranking toggle and no compras recentes panel after client select', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const selectorBtn = page.locator('button[aria-label="Selecionar cliente"]');
  await expect(selectorBtn).toBeVisible({ timeout: 10000 });
  await selectorBtn.click();

  const firstClient = page.locator('[role="option"]').first();
  const hasClient = await firstClient.isVisible({ timeout: 10000 }).catch(() => false);
  test.skip(!hasClient, 'No available client in the current E2E environment');
  await firstClient.click();

  await expect(page.getByText(/Comprado recentemente/)).toHaveCount(0);
  await expect(page.getByText('Compras recentes')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Alternar para Modo Ranking IA' })).toHaveCount(0);
});

test('M18 — Ordenar por IA shows ranking layout without mode toggle', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const selectorBtn = page.locator('button[aria-label="Selecionar cliente"]');
  await expect(selectorBtn).toBeVisible({ timeout: 10000 });
  await selectorBtn.click();

  const firstClient = page.locator('[role="option"]').first();
  const hasClient = await firstClient.isVisible({ timeout: 10000 }).catch(() => false);
  test.skip(!hasClient, 'No available client in the current E2E environment');
  await firstClient.click();

  const aiBtn = page.getByTestId('catalog-order-ai');
  await expect(aiBtn).toBeEnabled({ timeout: 15000 });
  await aiBtn.click();

  await expect(page.getByTestId('catalog-order-reset')).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Alternar para Modo Ranking IA' })).toHaveCount(0);

  const footer = page.getByTestId('catalog-ranking-footer-heading');
  const footerCount = await footer.count();
  if (footerCount > 0) {
    await expect(footer).toHaveText('—— Fora do ranking nesta janela ——');
  }
});

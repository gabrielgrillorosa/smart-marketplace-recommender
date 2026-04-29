import { test, expect } from '@playwright/test'

test('semantic search returns results or graceful error state', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const searchInput = page.locator('input[placeholder*="Busca semântica"]').first()
  await expect(searchInput).toBeVisible({ timeout: 10000 })
  await searchInput.fill('bebida refrescante')
  await searchInput.press('Enter')

  const resultsMessage = page.getByText(/resultado\(s\) para busca semântica/i)
  const errorMessage = page.getByText(/Erro na busca semântica/i)

  await expect
    .poll(async () => {
      if (await resultsMessage.isVisible().catch(() => false)) return 'results'
      if (await errorMessage.isVisible().catch(() => false)) return 'error'
      return 'pending'
    }, { timeout: 20000 })
    .not.toBe('pending')

  await expect(page.locator('[data-testid^="catalog-product-card-"]').first()).toBeVisible({ timeout: 20000 })
})

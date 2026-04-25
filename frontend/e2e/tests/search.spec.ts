import { test, expect } from '@playwright/test'

test('semantic search returns product cards', async ({ page }) => {
  await page.goto('/')

  // Find the semantic search input
  const searchInput = page.locator('input[placeholder*="Busca semântica"]')
  await searchInput.fill('bebida refrescante')
  await searchInput.press('Enter')

  // Wait for product cards to render after search
  await page.waitForTimeout(2000)

  // Verify product cards are visible in the catalog panel
  const cards = page.locator('.product-card, [class*="ProductCard"], article, [class*="rounded"][class*="border"]').first()
  await expect(cards).toBeVisible({ timeout: 15000 })
})

import { test, expect } from '@playwright/test'

test('recommendations panel shows scored product cards for selected client', async ({ page }) => {
  await page.goto('/')

  // Find the client panel — select a client from the dropdown/selector
  const clientSelector = page.locator('select, [role="combobox"], [class*="ClientSelector"]').first()
  await clientSelector.waitFor({ timeout: 10000 })

  // Select first available option if it's a select element
  const selectEl = page.locator('select').first()
  const options = await selectEl.locator('option').all()
  if (options.length > 1) {
    await selectEl.selectOption({ index: 1 })
  }

  // Click the "Get Recommendations" button
  const recommendBtn = page.locator('button:has-text("Recomendações"), button:has-text("Recommend"), button:has-text("⭐")')
  await recommendBtn.click()

  // Wait for recommendation cards with score values
  await page.waitForTimeout(3000)
  const scoreEl = page.locator('[class*="score"], [class*="Score"], text=/0\.\d+/')
  await expect(scoreEl.first()).toBeVisible({ timeout: 15000 })
})

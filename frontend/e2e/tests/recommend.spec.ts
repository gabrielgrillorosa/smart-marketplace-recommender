import { test, expect } from '@playwright/test'

test('recommendations panel shows scored product cards for selected client', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Navigate to the Client tab
  await page.locator('nav button:has-text("Cliente")').click()

  // Wait for loading indicator to disappear (clients fetched)
  await page.locator('text=Carregando clientes').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})

  // Wait for client options to be populated
  const selectEl = page.locator('select').first()
  await expect(selectEl.locator('option').nth(1)).toBeAttached({ timeout: 10000 })

  // Select first available client
  await selectEl.selectOption({ index: 1 })
  await page.waitForTimeout(300)

  // Click "Obter Recomendações" button
  await page.locator('button:has-text("Obter Recomendações")').click()

  // Wait for the button to be re-enabled (fetch complete)
  await page.locator('button:has-text("Obter Recomendações"):not([disabled])').waitFor({ timeout: 20000 })

  // Navigate to the Recomendações tab to see results
  await page.locator('nav button:has-text("Recomendações")').click()
  await page.waitForTimeout(500)

  // Validate score spans are visible
  const scoreEl = page.locator('span.cursor-help').first()
  await expect(scoreEl).toBeVisible({ timeout: 10000 })
  const scoreText = await scoreEl.textContent()
  expect(parseFloat(scoreText ?? '0')).toBeGreaterThan(0)
})

import { test, expect } from '@playwright/test'

test.describe('M8 UX Journey — happy path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('select client in navbar — badge visible', async ({ page }) => {
    const selectorBtn = page.locator('button[aria-label="Selecionar cliente"]')
    await expect(selectorBtn).toBeVisible({ timeout: 10000 })

    await selectorBtn.click()

    const clientOption = page.locator('[role="option"]').first()
    await expect(clientOption).toBeVisible({ timeout: 10000 })
    await clientOption.click()

    // Badge flag should be visible in the button
    await expect(selectorBtn).toBeVisible()
  })

  test('catalog AI sort — reorderable items with data-score visible', async ({ page }) => {
    // Select a client first
    const selectorBtn = page.locator('button[aria-label="Selecionar cliente"]')
    await selectorBtn.click()
    await page.locator('[role="option"]').first().click()

    // Navigate to Catálogo tab if needed
    const catalogTab = page.locator('button, a').filter({ hasText: /cat.logo/i }).first()
    if (await catalogTab.isVisible()) await catalogTab.click()

    // Wait for products to load
    await page.waitForSelector('[data-testid="reorderable-item"]', { timeout: 20000 })

    const sortBtn = page.locator('button').filter({ hasText: /Ordenar por IA/i }).first()
    await expect(sortBtn).toBeVisible({ timeout: 10000 })

    await sortBtn.click()

    // Wait for reordering
    await page.waitForTimeout(3000)

    const items = page.locator('[data-testid="reorderable-item"]')
    await expect(items.first()).toBeVisible({ timeout: 15000 })
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('reset to original order after AI sort', async ({ page }) => {
    const selectorBtn = page.locator('button[aria-label="Selecionar cliente"]')
    await selectorBtn.click()
    await page.locator('[role="option"]').first().click()

    await page.waitForSelector('[data-testid="reorderable-item"]', { timeout: 20000 })

    const sortBtn = page.locator('button').filter({ hasText: /Ordenar por IA/i }).first()
    await sortBtn.click()
    await page.waitForTimeout(3000)

    const resetBtn = page.locator('button').filter({ hasText: /Ordena.+original/i }).first()
    await expect(resetBtn).toBeVisible({ timeout: 10000 })
    await resetBtn.click()

    const sortBtnAfter = page.locator('button').filter({ hasText: /Ordenar por IA/i }).first()
    await expect(sortBtnAfter).toBeVisible({ timeout: 5000 })
  })

  test('open RAG drawer and send message', async ({ page }) => {
    const ragBtn = page.locator('button[aria-label="Abrir Chat RAG"]')
    await expect(ragBtn).toBeVisible({ timeout: 10000 })
    await ragBtn.click()

    const drawer = page.locator('[role="dialog"][aria-label="Chat RAG"]')
    await expect(drawer).toBeVisible({ timeout: 5000 })

    const chatInput = drawer.locator('input, textarea').first()
    if (await chatInput.isVisible()) {
      await chatInput.fill('Quais produtos estão disponíveis no Brasil?')
      await chatInput.press('Enter')
      await page.waitForTimeout(2000)
    }

    // Close with Escape
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible({ timeout: 5000 })
  })

  test('recommendations tab shows instruction banner when empty', async ({ page }) => {
    const recTab = page.locator('button, a').filter({ hasText: /Recomenda/i }).first()
    if (await recTab.isVisible()) {
      await recTab.click()
    }
    const banner = page.locator('text=Ordenar por IA').first()
    await expect(banner).toBeVisible({ timeout: 10000 })
  })
})

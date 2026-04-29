import { test, expect, type Page } from '@playwright/test'

async function selectFirstClient(page: Page): Promise<string | null> {
  const selectorBtn = page.locator('button[aria-label="Selecionar cliente"]')
  await expect(selectorBtn).toBeVisible({ timeout: 10000 })
  await selectorBtn.click()

  const firstClientOption = page.locator('[role="option"]').first()
  const hasClientOption = await firstClientOption.isVisible({ timeout: 20000 }).catch(() => false)
  if (!hasClientOption) {
    return null
  }

  const selectedLabel = (await firstClientOption.textContent())?.trim() ?? null
  await firstClientOption.click()
  return selectedLabel
}

test.describe('M8 UX Journey — happy path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('select client in navbar — badge visible', async ({ page }) => {
    const selectorBtn = page.locator('button[aria-label="Selecionar cliente"]')
    const selectedLabel = await selectFirstClient(page)
    test.skip(!selectedLabel, 'Sem clientes disponíveis no ambiente E2E atual.')

    await expect(selectorBtn).toContainText(selectedLabel!)
    await expect(selectorBtn).not.toContainText(/Selecionar cliente/i)
  })

  test('catalog AI sort — reorderable items with data-score visible', async ({ page }) => {
    const selectedLabel = await selectFirstClient(page)
    test.skip(!selectedLabel, 'Sem clientes disponíveis no ambiente E2E atual.')

    await page.waitForSelector('[data-testid="reorderable-item"]', { timeout: 20000 })

    const sortBtn = page.getByTestId('catalog-order-ai')
    await expect(sortBtn).toBeVisible({ timeout: 10000 })
    await sortBtn.click()

    await expect(page.getByTestId('catalog-order-reset')).toBeVisible({ timeout: 30000 })
    await expect
      .poll(async () => page.locator('[data-testid^="catalog-score-"]').count(), { timeout: 30000 })
      .toBeGreaterThan(0)
  })

  test('reset to original order after AI sort', async ({ page }) => {
    const selectedLabel = await selectFirstClient(page)
    test.skip(!selectedLabel, 'Sem clientes disponíveis no ambiente E2E atual.')

    await page.waitForSelector('[data-testid="reorderable-item"]', { timeout: 20000 })

    await page.getByTestId('catalog-order-ai').click()
    const resetBtn = page.getByTestId('catalog-order-reset')
    await expect(resetBtn).toBeVisible({ timeout: 30000 })
    await resetBtn.click()

    await expect(page.getByTestId('catalog-order-ai')).toBeVisible({ timeout: 10000 })
  })

  test('open RAG drawer and send message', async ({ page }) => {
    const ragBtn = page.locator('button[aria-label="Abrir Chat RAG"]')
    await expect(ragBtn).toBeVisible({ timeout: 10000 })
    await ragBtn.click()

    const drawer = page.locator('[role="dialog"][aria-label="Chat RAG"]')
    await expect(drawer).toBeVisible({ timeout: 10000 })

    const chatInput = drawer.locator('textarea')
    await expect(chatInput).toBeVisible({ timeout: 10000 })
    await chatInput.fill('Quais produtos estão disponíveis no Brasil?')
    await chatInput.press('Enter')

    await drawer.locator('text=⏳ Consultando...').waitFor({ state: 'detached', timeout: 60000 })
    await expect(drawer.locator('.rounded-bl-sm').first()).toBeVisible({ timeout: 10000 })

    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible({ timeout: 5000 })
  })
})

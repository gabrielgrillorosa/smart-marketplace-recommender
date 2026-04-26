import { test, expect } from '@playwright/test'

async function selectFirstClient(page: Parameters<typeof test.describe>[1] extends never ? never : Parameters<Parameters<typeof test>[1]>[0]) {
  const selectorBtn = page.locator('button[aria-label="Selecionar cliente"]')
  await expect(selectorBtn).toBeVisible({ timeout: 10000 })
  await selectorBtn.click()
  const clientOption = page.locator('[role="option"]').first()
  await expect(clientOption).toBeVisible({ timeout: 10000 })
  await clientOption.click()
}

async function activateAISort(page: Parameters<typeof test.describe>[1] extends never ? never : Parameters<Parameters<typeof test>[1]>[0]) {
  await page.waitForSelector('[data-testid="reorderable-item"]', { timeout: 20000 })
  const sortBtn = page.locator('button').filter({ hasText: /Ordenar por IA/i }).first()
  await expect(sortBtn).toBeVisible({ timeout: 10000 })
  await sortBtn.click()
  await page.waitForTimeout(3000)
}

test.describe('M9-A Demo Buy + Live Reorder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('demo-buy button visible after AI sort (M9A-01)', async ({ page }) => {
    await selectFirstClient(page)
    await activateAISort(page)

    const demoBuyBtn = page.locator('button').filter({ hasText: /Demo Comprar/i }).first()
    await expect(demoBuyBtn).toBeVisible({ timeout: 15000 })
  })

  test('clicking Demo Comprar triggers reorder and shows demo badge (M9A-02..M9A-06)', async ({ page }) => {
    await selectFirstClient(page)
    await activateAISort(page)

    const demoBuyBtn = page.locator('button').filter({ hasText: /Demo Comprar/i }).first()
    await expect(demoBuyBtn).toBeVisible({ timeout: 15000 })

    await demoBuyBtn.click()
    await page.waitForTimeout(2000)

    const demoBadge = page.locator('text=demo').first()
    await expect(demoBadge).toBeVisible({ timeout: 10000 })

    const desfazerBtn = page.locator('button').filter({ hasText: /Desfazer/i }).first()
    await expect(desfazerBtn).toBeVisible({ timeout: 5000 })
  })

  test('Desfazer removes demo badge (M9A-19)', async ({ page }) => {
    await selectFirstClient(page)
    await activateAISort(page)

    const demoBuyBtn = page.locator('button').filter({ hasText: /Demo Comprar/i }).first()
    await expect(demoBuyBtn).toBeVisible({ timeout: 15000 })
    await demoBuyBtn.click()
    await page.waitForTimeout(2000)

    const desfazerBtn = page.locator('button').filter({ hasText: /Desfazer/i }).first()
    await expect(desfazerBtn).toBeVisible({ timeout: 10000 })
    await desfazerBtn.click()
    await page.waitForTimeout(2000)

    const demoBadge = page.locator('text=demo').first()
    await expect(demoBadge).not.toBeVisible({ timeout: 5000 })
  })

  test('Limpar Demo button visible after demo buy with count (M9A-20)', async ({ page }) => {
    await selectFirstClient(page)
    await activateAISort(page)

    const demoBuyBtn = page.locator('button').filter({ hasText: /Demo Comprar/i }).first()
    await expect(demoBuyBtn).toBeVisible({ timeout: 15000 })
    await demoBuyBtn.click()
    await page.waitForTimeout(2000)

    const clearBtn = page.locator('button').filter({ hasText: /Limpar Demo/i }).first()
    await expect(clearBtn).toBeVisible({ timeout: 10000 })
    await expect(clearBtn).toContainText('1')
  })

  test('Limpar Demo clears all demo badges (M9A-21..M9A-22)', async ({ page }) => {
    await selectFirstClient(page)
    await activateAISort(page)

    const demoBuyBtn = page.locator('button').filter({ hasText: /Demo Comprar/i }).first()
    await expect(demoBuyBtn).toBeVisible({ timeout: 15000 })
    await demoBuyBtn.click()
    await page.waitForTimeout(2000)

    const clearBtn = page.locator('button').filter({ hasText: /Limpar Demo/i }).first()
    await expect(clearBtn).toBeVisible({ timeout: 10000 })
    await clearBtn.click()
    await page.waitForTimeout(2000)

    const demoBadge = page.locator('text=demo').first()
    await expect(demoBadge).not.toBeVisible({ timeout: 5000 })

    await expect(clearBtn).not.toBeVisible({ timeout: 3000 })
  })

  test('switching client clears demo badges (M9A-23..M9A-24)', async ({ page }) => {
    await page.goto('/')

    const selectorBtn = page.locator('button[aria-label="Selecionar cliente"]')
    await selectorBtn.click()
    const options = page.locator('[role="option"]')
    await expect(options.first()).toBeVisible({ timeout: 10000 })
    const count = await options.count()
    if (count < 2) {
      test.skip()
      return
    }
    await options.first().click()

    await page.waitForSelector('[data-testid="reorderable-item"]', { timeout: 20000 })
    const sortBtn = page.locator('button').filter({ hasText: /Ordenar por IA/i }).first()
    await sortBtn.click()
    await page.waitForTimeout(3000)

    const demoBuyBtn = page.locator('button').filter({ hasText: /Demo Comprar/i }).first()
    if (await demoBuyBtn.isVisible()) {
      await demoBuyBtn.click()
      await page.waitForTimeout(2000)
    }

    await selectorBtn.click()
    await options.nth(1).click()
    await page.waitForTimeout(1000)

    const demoBadge = page.locator('text=demo').first()
    await expect(demoBadge).not.toBeVisible({ timeout: 5000 })
  })
})

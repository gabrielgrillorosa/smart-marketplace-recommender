import { test, expect } from '@playwright/test'

test('recommendations are rendered after AI sort for a selected client', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const selectorBtn = page.locator('button[aria-label="Selecionar cliente"]')
  await expect(selectorBtn).toBeVisible({ timeout: 10000 })
  await selectorBtn.click()

  const firstClient = page.locator('[role="option"]').first()
  const hasClient = await firstClient.isVisible({ timeout: 10000 }).catch(() => false)
  test.skip(!hasClient, 'No available client in the current E2E environment')
  await firstClient.click()

  const sortBtn = page.locator('button').filter({ hasText: /Ordenar por IA/i }).first()
  await expect(sortBtn).toBeVisible({ timeout: 10000 })
  await sortBtn.click()

  // Score badges are rendered when recommendations were applied.
  const scoreBadge = page.locator('[aria-label^="Score IA:"]').first()
  await expect(scoreBadge).toBeVisible({ timeout: 20000 })
  await expect(scoreBadge).toContainText(/% score/i)
})

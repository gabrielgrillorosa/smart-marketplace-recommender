import { test, expect } from '@playwright/test'

test('RAG chat returns non-empty response', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Navigate to Chat RAG tab
  await page.locator('nav button:has-text("Chat RAG")').click()
  await page.waitForTimeout(500)

  // Find the RAG chat textarea
  const chatInput = page.locator('textarea').first()
  await chatInput.waitFor({ timeout: 10000 })
  await chatInput.fill('Quais produtos estão disponíveis?')
  await chatInput.press('Enter')

  // Wait for loading spinner to disappear
  await page.locator('text=⏳ Consultando...').waitFor({ state: 'detached', timeout: 60000 })
  await page.waitForTimeout(300)

  // Assert assistant message is visible (rounded-bl-sm is exclusive to assistant bubbles)
  const responseEl = page.locator('.rounded-bl-sm').first()
  await expect(responseEl).toBeVisible({ timeout: 5000 })
  const text = await responseEl.textContent()
  expect(text?.trim().length).toBeGreaterThan(0)
})

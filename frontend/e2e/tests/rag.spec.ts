import { test, expect } from '@playwright/test'

test('RAG chat returns non-empty response', async ({ page }) => {
  await page.goto('/')

  // Find the RAG chat textarea
  const chatInput = page.locator('textarea[placeholder*="catálogo"], textarea[placeholder*="pergunta"]')
  await chatInput.waitFor({ timeout: 10000 })
  await chatInput.fill('Quais produtos sem açúcar estão disponíveis no México?')

  // Submit (Enter or send button)
  await chatInput.press('Enter')

  // Wait for a non-empty response message to appear
  await page.waitForTimeout(5000)
  const responseText = page.locator('[class*="ChatMessage"], [class*="message"], [class*="assistant"]').first()
  await expect(responseText).toBeVisible({ timeout: 20000 })
  const text = await responseText.textContent()
  expect(text?.trim().length).toBeGreaterThan(0)
})

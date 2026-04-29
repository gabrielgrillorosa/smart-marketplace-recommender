import { test, expect } from '@playwright/test'

test('RAG chat returns non-empty response', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const chatTab = page.getByTestId('main-tab-chat')
  await expect(chatTab).toBeVisible({ timeout: 10000 })
  await chatTab.click()

  const chatPanel = page.locator('#panel-chat')
  await expect(chatPanel).toBeVisible({ timeout: 10000 })

  const chatInput = chatPanel.locator('textarea')
  await expect(chatInput).toBeVisible({ timeout: 10000 })
  await chatInput.fill('Quais produtos estão disponíveis?')
  await chatInput.press('Enter')

  await chatPanel.locator('text=⏳ Consultando...').waitFor({ state: 'detached', timeout: 60000 })

  const responseEl = chatPanel.locator('.rounded-bl-sm').first()
  await expect(responseEl).toBeVisible({ timeout: 5000 })
  const text = await responseEl.textContent()
  expect(text?.trim().length).toBeGreaterThan(0)
})

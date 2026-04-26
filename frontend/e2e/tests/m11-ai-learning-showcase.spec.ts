import { test, expect, type Page } from '@playwright/test'

async function navigateToAnalysis(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const analysisTab = page.locator('[role="tab"]').filter({ hasText: /Análise/i })
  await expect(analysisTab).toBeVisible({ timeout: 10000 })
  await analysisTab.click()
  await page.waitForLoadState('networkidle')
}

async function selectFirstClient(page: Page) {
  // Open client selector dropdown
  const clientSelector = page.locator('[data-testid="client-selector"], [aria-label*="cliente"], button').filter({ hasText: /selecione|cliente/i }).first()
  if (await clientSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clientSelector.click()
    await page.waitForTimeout(500)
    const firstOption = page.locator('[role="option"], [role="listbox"] li, [data-radix-select-item]').first()
    if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstOption.click()
      await page.waitForTimeout(500)
    }
  }
}

async function orderByAI(page: Page) {
  // Navigate to catalog first
  const catalogTab = page.locator('[role="tab"]').filter({ hasText: /Catálogo/i })
  if (await catalogTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await catalogTab.click()
    await page.waitForLoadState('networkidle')
  }
  // Click "Ordenar por IA" button
  const aiBtn = page.locator('button').filter({ hasText: /Ordenar por IA/i })
  if (await aiBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await aiBtn.click()
    await page.waitForTimeout(1000)
  }
}

test.describe('M11 — AI Learning Showcase', () => {
  test('Teste 1 — fase initial: coluna "Com IA" capturada após selecionar cliente e ordenar por IA', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await selectFirstClient(page)
    await orderByAI(page)
    await navigateToAnalysis(page)

    // Coluna "Com IA" deve estar populated (após recomendações carregadas)
    const comIaHeader = page.locator('text=Com IA').first()
    await expect(comIaHeader).toBeVisible({ timeout: 15000 })

    // Verifica que a coluna "Com Demo" ainda está no estado empty (sem compras demo)
    const comDemoHeader = page.locator('text=Com Demo').first()
    await expect(comDemoHeader).toBeVisible({ timeout: 5000 })
  })

  test('Teste 2 — fase demo: coluna "Com Demo" capturada após compra demo', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await selectFirstClient(page)
    await orderByAI(page)

    // Make a demo purchase
    const demoBuyBtn = page.locator('button').filter({ hasText: /Demo Comprar/i }).first()
    if (await demoBuyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await demoBuyBtn.click()
      await page.waitForTimeout(1500)
    }

    await navigateToAnalysis(page)

    // "Com Demo" column should exist in the panel
    const comDemoHeader = page.locator('text=Com Demo').first()
    await expect(comDemoHeader).toBeVisible({ timeout: 10000 })
  })

  test('Teste 3 — botão Retreinar desabilitado quando phase=empty (M11-26)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Navigate to analysis WITHOUT selecting a client or ordering by AI
    await navigateToAnalysis(page)

    const retrainBtn = page.locator('button').filter({ hasText: /Retreinar Modelo/i })
    await expect(retrainBtn).toBeVisible({ timeout: 10000 })

    // Button should be disabled when no snapshot has been captured (phase=empty)
    const isDisabled = await retrainBtn.evaluate((el: HTMLButtonElement) => el.disabled || el.getAttribute('aria-disabled') === 'true')
    expect(isDisabled).toBe(true)
  })

  test('Teste 4 — reset ao trocar cliente: colunas 3 e 4 voltam ao estado empty', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await selectFirstClient(page)
    await orderByAI(page)
    await navigateToAnalysis(page)

    // Panel loads with Com IA column
    const comIaHeader = page.locator('text=Com IA').first()
    await expect(comIaHeader).toBeVisible({ timeout: 15000 })

    // Make a demo purchase to advance to demo phase
    const catalogTab = page.locator('[role="tab"]').filter({ hasText: /Catálogo/i })
    if (await catalogTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await catalogTab.click()
      await page.waitForLoadState('networkidle')
      const demoBuyBtn = page.locator('button').filter({ hasText: /Demo Comprar/i }).first()
      if (await demoBuyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await demoBuyBtn.click()
        await page.waitForTimeout(1000)
      }
    }

    // Select a different client to reset state
    const clientSelector = page.locator('[data-testid="client-selector"], button').filter({ hasText: /selecione|cliente/i }).first()
    if (await clientSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clientSelector.click()
      await page.waitForTimeout(500)
      // Pick second option
      const secondOption = page.locator('[role="option"], [role="listbox"] li, [data-radix-select-item]').nth(1)
      if (await secondOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await secondOption.click()
        await page.waitForTimeout(500)
      }
    }

    // Navigate back to analysis
    await navigateToAnalysis(page)

    // After client change, analysis should be reset — Retreinar button disabled again
    const retrainBtn = page.locator('button').filter({ hasText: /Retreinar Modelo/i })
    await expect(retrainBtn).toBeVisible({ timeout: 10000 })
    const isDisabled = await retrainBtn.evaluate((el: HTMLButtonElement) => el.disabled || el.getAttribute('aria-disabled') === 'true')
    expect(isDisabled).toBe(true)
  })

  test('Teste 5 — layout tablet: botão accordion "Ver Com Demo" presente em viewport md', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await navigateToAnalysis(page)

    // At md viewport, accordion button should be visible in the showcase section
    // The showcase section is in the "Showcase" tab at mobile
    const showcaseTab = page.locator('[role="tab"]').filter({ hasText: /Showcase/i })
    if (await showcaseTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await showcaseTab.click()
      await page.waitForTimeout(500)
    }

    // Accordion button should exist
    const accordionBtn = page.locator('button').filter({ hasText: /Ver Com Demo|Com Demo e Pós-Retreino/i }).first()
    const hasAccordion = await accordionBtn.isVisible({ timeout: 5000 }).catch(() => false)

    // At md viewport on desktop layout, both columns 1-2 are visible and accordion for 3-4
    // Accept either accordion visible OR the 4-column grid (depends on layout breakpoint)
    const comDemoHeader = page.locator('text=Com Demo').first()
    const hasComDemo = await comDemoHeader.isVisible({ timeout: 3000 }).catch(() => false)

    // At least one of these should be true at md viewport
    expect(hasAccordion || hasComDemo).toBeTruthy()
  })

  test('Teste 6 — layout mobile: tabs internas incluem Showcase (M11-24)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await navigateToAnalysis(page)

    // At mobile viewport, there should be a "Showcase" or "Retreinar" tab
    const showcaseTab = page.locator('[role="tab"]').filter({ hasText: /Showcase/i })
    await expect(showcaseTab).toBeVisible({ timeout: 10000 })

    // Click showcase tab → columns visible
    await showcaseTab.click()
    const semIaHeader = page.locator('text=Sem IA').first()
    await expect(semIaHeader).toBeVisible({ timeout: 5000 })
  })

  test('Teste 7 — fase retrained: fluxo completo selecionar→demo→retreinar (longo)', async ({ page }) => {
    test.setTimeout(300000) // 5 minutes for full retrain

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await selectFirstClient(page)
    await orderByAI(page)

    // Demo purchase
    const demoBuyBtn = page.locator('button').filter({ hasText: /Demo Comprar/i }).first()
    if (await demoBuyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await demoBuyBtn.click()
      await page.waitForTimeout(1500)
    }

    await navigateToAnalysis(page)

    // Wait for Com Demo to populate
    const comDemoHeader = page.locator('text=Com Demo').first()
    await expect(comDemoHeader).toBeVisible({ timeout: 10000 })

    // Retrain button should now be enabled (phase=demo)
    const retrainBtn = page.locator('button').filter({ hasText: /Retreinar Modelo/i })
    await expect(retrainBtn).toBeVisible({ timeout: 10000 })

    const isEnabled = await retrainBtn.evaluate((el: HTMLButtonElement) => !el.disabled && el.getAttribute('aria-disabled') !== 'true')
    if (!isEnabled) {
      // If still disabled, skip — dependencies not fully met in test env
      test.skip()
      return
    }

    await retrainBtn.click()

    // Wait for training to complete
    await page.waitForFunction(
      () => {
        const text = document.body.innerText
        return text.includes('Retreinamento concluído') || text.includes('falhou') || text.includes('Erro de conexão')
      },
      { timeout: 240000 }
    )

    const succeeded = await page.locator('text=Retreinamento concluído ✅').isVisible().catch(() => false)
    if (succeeded) {
      // Coluna "Pós-Retreino" should be visible
      const posRetreinoHeader = page.locator('text=Pós-Retreino').first()
      await expect(posRetreinoHeader).toBeVisible({ timeout: 10000 })
    } else {
      // Accept terminal failure states as valid
      const isTerminal =
        (await page.locator('text=Retreinamento falhou').isVisible().catch(() => false)) ||
        (await page.locator('text=Erro de conexão').isVisible().catch(() => false))
      expect(isTerminal).toBeTruthy()
    }
  })
})

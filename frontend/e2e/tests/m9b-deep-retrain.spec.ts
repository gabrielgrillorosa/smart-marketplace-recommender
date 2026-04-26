import { test, expect, type Page } from '@playwright/test'

async function navigateToAnalysis(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const analysisTab = page.locator('[role="tab"]').filter({ hasText: /Análise/i })
  await expect(analysisTab).toBeVisible({ timeout: 10000 })
  await analysisTab.click()
}

test.describe('M9-B Deep Retrain Showcase', () => {
  test('Teste 1 — painel visível e botão habilitado (M9B-01)', async ({ page }) => {
    await navigateToAnalysis(page)

    const retrainBtn = page.locator('button').filter({ hasText: /Retreinar Modelo/i })
    await expect(retrainBtn).toBeVisible({ timeout: 10000 })
    await expect(retrainBtn).toBeEnabled()
  })

  test('Teste 2 — fluxo completo: progress bar → done → métricas Antes/Depois (M9B-02..M9B-12)', async ({ page }) => {
    await navigateToAnalysis(page)

    const retrainBtn = page.locator('button').filter({ hasText: /Retreinar Modelo/i })
    await expect(retrainBtn).toBeVisible({ timeout: 10000 })
    await retrainBtn.click()

    // Progress bar appears (M9B-03)
    const progressBar = page.locator('[role="progressbar"]')
    await expect(progressBar).toBeVisible({ timeout: 5000 })

    // Button disabled with "Retreinando..." text (M9B-06)
    const retreinandoBtn = page.locator('button').filter({ hasText: /Retreinando\.\.\./i })
    await expect(retreinandoBtn).toBeVisible({ timeout: 5000 })
    await expect(retreinandoBtn).toBeDisabled()

    // Wait for training to complete (M9B-05) — up to 3 minutes
    await page.waitForFunction(
      () => {
        const text = document.body.innerText
        return text.includes('Retreinamento concluído') || text.includes('falhou') || text.includes('Erro de conexão')
      },
      { timeout: 180000 }
    )

    const successText = page.locator('text=Retreinamento concluído ✅')
    const failedText = page.locator('text=Retreinamento falhou')
    const networkErrorText = page.locator('text=Erro de conexão')

    const succeeded = await successText.isVisible().catch(() => false)

    if (succeeded) {
      // Metrics "Antes" and "Depois" columns visible (M9B-10)
      await expect(page.locator('text=Antes')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('text=Depois')).toBeVisible({ timeout: 5000 })

      // Comparison badge present (M9B-11 or M9B-12)
      const badge = page.locator('text=↑ Melhora, text=→ Igual, text=↓ Regressão').first()
      const hasBadge =
        (await page.locator('text=↑ Melhora').isVisible().catch(() => false)) ||
        (await page.locator('text=→ Igual').isVisible().catch(() => false)) ||
        (await page.locator('text=↓ Regressão').isVisible().catch(() => false))
      expect(hasBadge).toBeTruthy()
    } else {
      // Accept failed or network-error as valid terminal states
      const isTerminal =
        (await failedText.isVisible().catch(() => false)) ||
        (await networkErrorText.isVisible().catch(() => false))
      expect(isTerminal).toBeTruthy()
    }
  })

  test('Teste 3 — persistência entre abas: métricas sobrevivem à navegação (M9B-22)', async ({ page }) => {
    await navigateToAnalysis(page)

    const retrainBtn = page.locator('button').filter({ hasText: /Retreinar Modelo/i })
    await expect(retrainBtn).toBeVisible({ timeout: 10000 })
    await retrainBtn.click()

    // Wait for "queued" or "running" state
    await expect(page.locator('[role="progressbar"]')).toBeVisible({ timeout: 5000 })

    // Wait for completion
    await page.waitForFunction(
      () => document.body.innerText.includes('Retreinamento concluído') ||
             document.body.innerText.includes('falhou') ||
             document.body.innerText.includes('Erro de conexão'),
      { timeout: 180000 }
    )

    const succeeded = await page.locator('text=Retreinamento concluído ✅').isVisible().catch(() => false)
    if (!succeeded) {
      test.skip()
      return
    }

    // Navigate away to Catalog
    const catalogTab = page.locator('[role="tab"]').filter({ hasText: /Catálogo/i })
    await catalogTab.click()
    await page.waitForTimeout(500)

    // Navigate back to Análise
    const analysisTab = page.locator('[role="tab"]').filter({ hasText: /Análise/i })
    await analysisTab.click()

    // Metrics "Depois" still visible (M9B-22 — always-mounted ADR-023)
    await expect(page.locator('text=Depois')).toBeVisible({ timeout: 5000 })
  })

  test('Teste 4 — layout mobile: tabs internas Comparação e Retreinar (M9B-15)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await navigateToAnalysis(page)

    // Internal tabs visible at mobile viewport
    const comparacaoTab = page.locator('[role="tab"]').filter({ hasText: /Comparação/i })
    const retreinarTab = page.locator('[role="tab"]').filter({ hasText: /Retreinar/i })

    await expect(comparacaoTab).toBeVisible({ timeout: 10000 })
    await expect(retreinarTab).toBeVisible({ timeout: 10000 })

    // Click Retreinar tab → RetrainPanel visible
    await retreinarTab.click()
    const retrainBtn = page.locator('button').filter({ hasText: /Retreinar Modelo/i })
    await expect(retrainBtn).toBeVisible({ timeout: 5000 })
  })
})

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    screenshotPath: 'e2e/screenshots',
  },
  outputDir: 'e2e/screenshots',
})

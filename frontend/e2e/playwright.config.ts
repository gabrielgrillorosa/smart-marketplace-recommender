import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  // Run tests sequentially: cart/model state lives in shared backends (PostgreSQL,
  // Neo4j, ai-service VersionedModelStore) and parallel runs cause flakiness.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
  },
  outputDir: 'e2e/screenshots',
})

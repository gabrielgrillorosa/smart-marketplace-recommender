import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    alias: {
      // Map .js imports to .ts source during tests
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
})

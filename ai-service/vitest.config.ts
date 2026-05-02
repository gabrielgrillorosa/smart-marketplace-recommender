import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/tests/vitest-env-setup.ts'],
    include: [
      'src/**/*.test.ts',
    ],
    alias: {
      // Map .js imports to .ts source during tests
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
})

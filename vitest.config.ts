import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reporter: ['html', 'json', 'lcov', 'text'],
    },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts']
  }
});

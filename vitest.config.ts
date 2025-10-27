import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['html', 'json', 'lcov', 'text'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test-utils/*',
        'src/types/*'
      ]
    },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  }
});

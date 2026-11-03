import { defineConfig } from 'vitest/config';
export default defineConfig({ define: { __DEMO__: false }, test: { include: ['src/**/*.test.ts'] } });

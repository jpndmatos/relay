import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  define: { __DEMO__: JSON.stringify(mode === 'demo') },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5180',
      '/hubs': { target: 'http://localhost:5180', ws: true },
      '/openapi': 'http://localhost:5180',
    },
  },
  build: { outDir: '../src/Relay.Api/wwwroot', emptyOutDir: true, manifest: 'asset-manifest.json' },
}));

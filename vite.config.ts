import { defineConfig } from 'vite';

const serverPort = Number(process.env.PORT) || 3000;

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5180,
    host: true,
    proxy: {
      '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
    },
  },
});

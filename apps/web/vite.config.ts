import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `/api/*` is proxied to the Express API in dev. In `vite preview` (or when the
// API is down) the request fails and `src/api/client.ts` falls back to mock data.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: { port: 4173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'animejs'],
        },
      },
    },
  },
});

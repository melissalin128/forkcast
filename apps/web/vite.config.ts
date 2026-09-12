import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `/api/*` is proxied to the Express API in dev. In `vite preview` (or when the
// API is down) the request fails and `src/api/client.ts` falls back to mock data.
//
// The PWA plugin makes the app installable ("Add to Home Screen" on iPhone and
// Android) and caches the shell so it opens instantly. API responses are never
// cached by the service worker: prices must always be fresh.
// The hash-router build is for static previews on a shared origin, where a
// service worker would be wrong, so the PWA plugin is skipped there.
const isStaticPreview = process.env.VITE_ROUTER === 'hash';

export default defineConfig({
  plugins: [
    react(),
    !isStaticPreview && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Forkcast',
        short_name: 'Forkcast',
        description:
          'Compare the delivered total on DoorDash, Uber Eats and Grubhub and see which app is cheapest right now.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts' },
          },
        ],
      },
    }),
  ].filter(Boolean),
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

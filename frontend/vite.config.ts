import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA configured for offline-first field use. autoUpdate so techs always get the
// latest shell. Runtime caching of the app shell only; data sync is handled
// explicitly by the app (see src/lib/syncQueue.ts), NOT by the service worker,
// because field data integrity must not depend on opaque SW cache behavior.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Restoration Documentation',
        short_name: 'RestoreDoc',
        description: 'Field documentation for property restoration claims',
        theme_color: '#ea580c',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      }
    })
  ],
  server: { port: 5173 }
});

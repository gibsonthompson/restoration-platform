import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Build id stamped into the app (__APP_VERSION__) and written to dist/version.json.
// The running app polls version.json and force-updates on a mismatch (src/lib/version.ts).
const BUILD_ID = String(Date.now());

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      closeBundle() {
        try { writeFileSync(resolve(process.cwd(), 'dist/version.json'), JSON.stringify({ version: BUILD_ID })); } catch { /* ignore */ }
      }
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-32.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'],
      manifest: {
        name: 'Restoration Documentation',
        short_name: 'RestoreDoc',
        description: 'Field documentation for property restoration claims',
        theme_color: '#0E2A4D',
        background_color: '#0E2A4D',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ],
  server: { port: 5173 }
});
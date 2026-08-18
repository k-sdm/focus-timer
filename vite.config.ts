import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The board has no server to talk to, so a new build is always safe to
      // take immediately rather than waiting for every tab to close.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon.png'],
      workbox: {
        // Everything the board needs, precached up front: there is no runtime
        // fetching to fall back on, so a partial cache is no cache at all.
        globPatterns: ['**/*.{js,css,html,woff2,png}'],
        // The three.js bundle is comfortably over the 2 MiB default.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
      },
      manifest: {
        name: 'Focus Timer',
        short_name: 'Focus',
        description: 'A focus timer with reactive visualisations.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#0b0b0b',
        theme_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
  build: { target: 'es2022', outDir: 'dist' },
})

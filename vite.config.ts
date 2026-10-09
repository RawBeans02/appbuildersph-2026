/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The new service worker takes over as soon as it installs, so every
      // deploy to main reaches the next load without a prompt.
      registerType: 'autoUpdate',
      // Placeholder manifest: the name, colors and icons come from design/.
      manifest: {
        name: 'appbuildersph-2026',
        short_name: 'appbuildersph-2026',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [],
      },
      workbox: {
        // Precache the whole app shell; any navigation offline gets index.html.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

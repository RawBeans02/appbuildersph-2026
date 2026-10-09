/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
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
        // Also the on-device AI: the ONNX Runtime .wasm/.mjs and the model files
        // in public/models/ (the OCR spike's PP-OCRv5 files for now).
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2,wasm,onnx,txt}'],
        // The ONNX Runtime .wasm is about 14 MB; Workbox skips files over 2 MiB by default.
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // ES module workers can code-split; model runtimes dynamically import their
  // own .mjs and locate their .wasm through import.meta.url, which IIFE breaks.
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // The throwaway OCR spike page; not linked from the app.
        'spike-ocr': fileURLToPath(new URL('./spike-ocr.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'spikes/**/*.test.ts'],
  },
})

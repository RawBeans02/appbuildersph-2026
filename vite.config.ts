/// <reference types="vitest/config" />
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Every spike-*.html at the root is its own page: throwaway test pages, not
// linked from the app.
const spikePages = Object.fromEntries(
  readdirSync(fileURLToPath(new URL('.', import.meta.url)))
    .filter((file) => /^spike-[\w-]+\.html$/.test(file))
    .map((file) => [file.slice(0, -'.html'.length), fileURLToPath(new URL(`./${file}`, import.meta.url))]),
)

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
        // The precache is the app shell only. Models and runtime .wasm files are
        // downloaded by the "Prepare for offline" step into the model caches
        // (src/lib/modelCache.ts), not here, so the first visit stays light.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The Tesseract.js worker and core are model files (prepared on
        // demand when that engine is on), not app shell.
        globIgnores: ['**/worker.min-*.js', '**/tesseract-core-*.js', '**/webllm.worker-*.js'],
        runtimeCaching: [
          {
            // The laptop's AI wording worker (WebLLM, about 6 MB, too big to
            // precache for every phone): cached the first time the officer uses
            // it online, which the model download needs anyway. Hashed file
            // names never change, so cache-first is safe.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/webllm\.worker-[\w-]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'agapay-laptop-ai', expiration: { maxEntries: 4 } },
          },
          {
            // Serve model and .wasm files from whichever model cache holds them,
            // else from the network (online only, and nothing is stored here).
            // Workbox inlines this function into sw.js, so it may only use
            // service worker globals.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && (url.pathname.startsWith('/models/') || url.pathname.endsWith('.wasm')),
            handler: async ({ request }) => {
              const scope = globalThis as unknown as { caches: { match(request: Request): Promise<Response | undefined> } }
              return (await scope.caches.match(request)) ?? fetch(request)
            },
          },
        ],
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
        ...spikePages,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'spikes/**/*.test.ts'],
  },
})

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
      // The manifest values from design/README.md ("App icon and manifest").
      manifest: {
        name: 'Agapay',
        short_name: 'Agapay',
        description: 'Offline health checks for barangay health workers after a typhoon.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#F7F4ED',
        background_color: '#F7F4ED',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The precache is the app shell only. Models and runtime .wasm files are
        // downloaded by the "Prepare for offline" step into the model caches
        // (src/lib/modelCache.ts), not here, so the first visit stays light.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The Tesseract.js worker and core are model files (prepared on
        // demand when that engine is on), not app shell.
        globIgnores: ['**/worker.min-*.js', '**/tesseract-core-*.js', '**/webllm.worker-*.js', 'splash/**'],
        runtimeCaching: [
          {
            // The optional phase 2 backend (api/): always the network, never a
            // cache, so a sync or the DOH view never sees a stored answer.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
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
            // A download (modelCache asks for no-store) always goes to the
            // network, so a new model version never gets an older version's
            // file stored under the same URL.
            handler: async ({ request }) => {
              if (request.cache === 'no-store') return fetch(request)
              const scope = globalThis as unknown as { caches: { match(request: Request): Promise<Response | undefined> } }
              return (await scope.caches.match(request)) ?? fetch(request)
            },
          },
        ],
        navigateFallback: '/index.html',
        // A real file, not an app route: opening /robots.txt shows the file.
        // The API's routes are never the app shell either.
        navigateFallbackDenylist: [/^\/robots\.txt$/, /^\/api\//],
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
    // server/**/*.pg.test.ts need a real Postgres: `npm run test:api` (CI).
    include: ['src/**/*.test.ts', 'spikes/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.git/**', 'server/**/*.pg.test.ts'],
  },
})

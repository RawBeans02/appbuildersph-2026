import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run in CI only; the 8 GB build laptop doesn't run browsers.
// The app is built and served with vite preview, so the real service worker
// and precache are what get tested.
const PORT = 4173
// E2E_BASE_URL runs the tests against a deployed site (e.g. the live URL)
// instead of a local build.
const deployed = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: deployed ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: deployed
    ? undefined
    : {
        command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})

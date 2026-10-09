import { expect, test } from '@playwright/test'

// The offline promise of the app shell: after one online visit, the app opens
// with no network, for the start page and for any deep link.
// Waits on data-shell-status (set in src/lib/appShell.ts), not on page copy,
// so the test survives the designed screens replacing the placeholder.

test('the app shell opens offline after the first visit', async ({ page, context, browserName }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
  // The worker must control the page before the network goes away.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await context.setOffline(true)

  const reloaded = await page.reload()
  // Playwright reports a service-worker response only in Chromium; elsewhere
  // the page loading at all with no network is the proof.
  if (browserName === 'chromium') expect(reloaded?.fromServiceWorker()).toBe(true)
  await expect(page.locator('h1')).toBeVisible()
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)

  const deepLink = await page.goto('/any/deep/link')
  if (browserName === 'chromium') expect(deepLink?.fromServiceWorker()).toBe(true)
  await expect(page.locator('h1')).toBeVisible()
})

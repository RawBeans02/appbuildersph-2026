import { expect, type Page } from '@playwright/test'
import { openPage } from './lock'

// "Prepare for offline" to the end, as a person does it on /prepare: Download,
// Continue on the "keep AgapayMo's files" sheet, then the box reader warms up
// and the screen goes to Home.
export async function prepareForOffline(page: Page) {
  await openPage(page, '/prepare')
  await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
  // The worker must control the page before the network goes away.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await page.getByRole('button', { name: /^Download [\d.]+ MB/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL((url) => url.pathname === '/', { timeout: 180_000 })
}

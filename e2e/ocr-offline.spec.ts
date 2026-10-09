import { expect, test } from '@playwright/test'
import { prepareForOffline } from './prepare'
import { DEMO_SCAN_LABEL } from '../src/data/seed/demoLabel'
import { openPage } from './lock'

// The Local AI proof: after "Prepare for offline", with no network at all,
// the real PP-OCRv5 models read the demo box's label in the browser (WASM, in
// a worker) and the review screen is filled in from what they read.

test('reads the demo doxycycline box offline with the on-device OCR', async ({ page, context }) => {
  test.setTimeout(300_000)
  await prepareForOffline(page)

  await context.setOffline(true)
  await openPage(page, '/stock')
  // No camera in headless Chromium: the scan screen offers a photo instead.
  await page.getByRole('button', { name: 'Scan a box' }).click()
  await page.getByLabel('Scan a medicine box', { exact: true }).setInputFiles('docs/demo/label-doxy-24A.png')

  await expect(page.getByRole('heading', { name: 'Check what was read' })).toBeVisible({ timeout: 120_000 })
  await expect(page.getByLabel('Medicine', { exact: true })).toHaveValue(DEMO_SCAN_LABEL.drug)
  await expect(page.getByLabel('Strength', { exact: true })).toHaveValue(DEMO_SCAN_LABEL.strength)
  await expect(page.getByLabel('Lot number', { exact: true })).toHaveValue(DEMO_SCAN_LABEL.lot)
  await expect(page.getByLabel('Expiry', { exact: true })).toHaveValue(DEMO_SCAN_LABEL.expiry)
  console.log('Stock screen timing (CI runner):', await page.getByText(/^Read on this phone in/).textContent())
})

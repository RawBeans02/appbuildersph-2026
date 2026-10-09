import { expect, test, type Page } from '@playwright/test'
import { DEMO_SCAN_LABEL } from '../src/data/seed/demoLabel'
import { openPage } from './lock'

// The phone's wow flow on the synthetic seed, as the demo runs it but without
// the camera: tap the three demo households as exposed, add the box the
// presenter scans (typed in by hand here; the OCR path has its own unit and
// model tests), flag for clinician review, and create the de-identified QR.
// The label's expiry is printed (EXP 11/2026), so the "expiring" count holds
// for the demo days, not forever.

// A watch-list section's count, from its heading ("In the window now 9").
const section = (page: Page, title: string) => page.getByRole('heading', { level: 2, name: new RegExp(`^${title} \\d+$`) })

test('tap exposed, add the scanned box, flag for review, create the QR', async ({ page }) => {
  test.setTimeout(90_000)
  await openPage(page, '/')
  await expect(page.getByRole('heading', { level: 1, name: 'Maligaya-D' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('San Isidro Demo · Sample data')).toBeVisible()

  // Flood exposure: the three one-person households the demo taps.
  await openPage(page, '/watch')
  await expect(page.getByRole('heading', { level: 1, name: 'Watch list' })).toBeVisible()
  await expect(section(page, 'In the window now')).toHaveText(/ 9$/)
  await expect(section(page, 'Starts soon')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mark more people exposed' }).click()
  for (const id of ['HH-03', 'HH-07', 'HH-10']) {
    const household = page.getByRole('button', { name: new RegExp(`^${id}.*1 person$`) })
    await household.click()
    await expect(household).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByRole('button', { name: 'Confirm and start the watch' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Start the watch/ }).click()
  await expect(page.getByText('Watch started for 3 people.')).toBeVisible()
  await expect(section(page, 'In the window now')).toHaveText(/ 9$/)
  await expect(section(page, 'Starts soon')).toHaveText(/ 3$/)

  // Stock: the demo box, typed in with the label's values (no camera here).
  await openPage(page, '/stock')
  await page.getByRole('button', { name: 'Scan a box' }).click()
  await page.getByRole('button', { name: 'Type it in' }).click()
  await page.getByLabel('Medicine', { exact: true }).fill(DEMO_SCAN_LABEL.drug)
  await page.getByLabel('Strength', { exact: true }).fill(DEMO_SCAN_LABEL.strength)
  await page.getByLabel('Lot number', { exact: true }).fill(DEMO_SCAN_LABEL.lot)
  await page.getByLabel('Expiry', { exact: true }).fill(DEMO_SCAN_LABEL.expiry)
  await page.getByLabel('How many on hand', { exact: true }).fill(String(DEMO_SCAN_LABEL.quantity))
  await page.getByLabel('Unit', { exact: true }).selectOption(DEMO_SCAN_LABEL.unit)
  await page.getByRole('button', { name: /^Confirm/ }).click()
  await expect(page.getByRole('status').filter({ hasText: `lot ${DEMO_SCAN_LABEL.lot}.` })).toBeVisible()

  // Exposure × stock: the demo's three numbers, then the flag. Never a dose.
  const metric = (label: string) => page.locator('p').filter({ hasText: label })
  await openPage(page, '/compare')
  await expect(metric('people exposed to floodwater')).toHaveText(/^12\D/)
  await expect(metric('doxycycline capsules on hand')).toHaveText(/^40\D/)
  await expect(metric('of them expire within 6 weeks')).toHaveText(/^30\D/)
  await expect(page.getByText(/dose/i)).toHaveText(['AgapayMo never suggests a dose. Doxycycline is given only after consultation with a health professional (DOH guideline).'])
  await page.getByRole('button', { name: 'Flag for clinician review' }).click()
  await expect(page.getByText('Flagged for clinician review', { exact: true })).toBeVisible()

  // Home (1e): the same records as task sentences, each row a link.
  await openPage(page, '/')
  await expect(page.getByRole('link', { name: /^9 people in the watch window today/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: /^30 doxycycline capsules expire within 6 weeks/ })).toContainText('Use these first · 40 on hand')
  await expect(page.getByRole('link', { name: /^1 flag waiting for clinician review/ })).toBeVisible()

  // Send: the de-identified table and the QR.
  await openPage(page, '/send')
  await expect(page.getByRole('row', { name: /Doxycycline capsules on hand/ })).toContainText('40')
  await expect(page.getByRole('row', { name: /Flags for clinician review/ })).toContainText('<5')
  await page.getByRole('button', { name: /^Show the QR/ }).click()
  await expect(page.getByRole('img', { name: "QR code with this week's counts" })).toBeVisible()
  await expect(page.getByText(/^SID-MAL · \d{4}-W\d{2} · #1$/)).toBeVisible()
  await expect(page.getByText(/Residente/)).toHaveCount(0)
})

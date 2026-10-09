import { expect, test, type Page } from '@playwright/test'
import { DEMO_SCAN_LABEL } from '../src/data/seed/demoLabel'

// The phone's wow flow on the synthetic seed, as the demo runs it but without
// the camera: tap the three demo households as exposed, add the box the
// presenter scans (typed in by hand here; the OCR path has its own unit and
// model tests), flag for clinician review, and create the de-identified QR.
// The label's expiry is printed (EXP 11/2026), so the "expiring" count holds
// for the demo days, not forever.

async function watchCount(page: Page): Promise<number> {
  const heading = await page.getByRole('heading', { name: /^Watch list \(\d+\)$/ }).textContent()
  return Number(/\((\d+)\)/.exec(heading ?? '')?.[1])
}

test('tap exposed, add the scanned box, flag for review, create the QR', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Maligaya-D' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('San Isidro Demo · Sample data')).toBeVisible()

  // Flood exposure: the three one-person households the demo taps.
  await page.goto('/watch')
  await expect(page.getByText(/^Flood since /)).toBeVisible()
  expect(await watchCount(page)).toBe(9)
  for (const id of ['HH-03', 'HH-07', 'HH-10']) {
    const household = page.getByRole('button', { name: new RegExp(`^${id}, .*1 person`) })
    await household.click()
    await expect(household).toHaveAttribute('aria-pressed', 'true')
  }
  await expect.poll(() => watchCount(page)).toBe(12)

  // Stock: the demo box, entered by hand with the label's values.
  await page.goto('/stock')
  await page.getByRole('button', { name: 'Add by hand' }).click()
  await page.getByLabel('Medicine').fill(DEMO_SCAN_LABEL.drug)
  await page.getByLabel('Strength').fill(DEMO_SCAN_LABEL.strength)
  await page.getByLabel('Lot number').fill(DEMO_SCAN_LABEL.lot)
  await page.getByLabel('Expiry').fill(DEMO_SCAN_LABEL.expiry)
  await page.getByLabel('How many on hand').fill(String(DEMO_SCAN_LABEL.quantity))
  await page.getByLabel('Unit').selectOption(DEMO_SCAN_LABEL.unit)
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByText(new RegExp(`lot ${DEMO_SCAN_LABEL.lot}`))).toBeVisible()

  // Exposure × stock: the demo's line, then the flag. Never a dose.
  await page.goto('/compare')
  await expect(page.getByText('12 exposed · 40 doxycycline capsules · 30 expire within 6 weeks')).toBeVisible()
  await expect(page.getByText(/dose/i)).toHaveText(['Agapay never suggests a dose. Doxycycline is given only after consultation with a health professional (DOH).'])
  await page.getByRole('button', { name: 'Flag for clinician review' }).click()
  await expect(page.getByText(/^Flagged for clinician review on /)).toBeVisible()

  // Send: the de-identified table and the QR.
  await page.goto('/send')
  await expect(page.getByRole('row', { name: /Doxycycline capsules on hand/ })).toContainText('40')
  await expect(page.getByRole('row', { name: /Flags for clinician review/ })).toContainText('<5')
  await page.getByRole('button', { name: /^Show the QR/ }).click()
  await expect(page.getByRole('img', { name: "QR code with this week's counts" })).toBeVisible()
  await expect(page.getByText(/^SID-MAL · \d{4}-W\d{2} · #1$/)).toBeVisible()
  await expect(page.getByText(/Residente/)).toHaveCount(0)
})

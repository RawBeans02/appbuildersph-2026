import { expect, test, type BrowserContext } from '@playwright/test'
import { DEMO_SCAN_LABEL } from '../src/data/seed/demoLabel'
import { prepareForOffline } from './prepare'
import { openPage } from './lock'

// The whole demo with no camera and no network, phone to laptop. The phone
// (one browser context) runs "Prepare for offline", goes offline, then does
// the wow flow: three households exposed, the demo box typed in, 12 · 40 · 30
// flagged for review, and the pairing QR and the counts QR on Send. The
// municipal laptop (a second context, its own storage) opens once online so
// its service worker holds the app, goes offline, takes both QR texts through
// the paste fallback (the officer checks the fingerprint), merges Maligaya-D
// with the four sample barangays, and approves the plan as listed (rules
// only; the AI wording is never asked for). No request leaves the app's
// origin in either context.

// The demo's five barangays (src/data/places.ts): the live phone, then the
// four pre-made sample QRs (src/data/seed/municipal.ts).
const BARANGAYS = ['Maligaya-D', 'Bagong Silang-D', 'Santo Niño-D', 'Mabini-D', 'Riverside-D']
const FINGERPRINT = /[0-9A-F]{4}(?:-[0-9A-F]{4}){3}/

// Collects every request that goes anywhere but the app's own origin.
function watchOrigin(context: BrowserContext, origin: string, elsewhere: string[]) {
  context.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:')) elsewhere.push(url)
  })
}

test('the full demo offline: phone wow flow, then pair, receive, merge and approve on the laptop', async ({
  page,
  context,
  browser,
  baseURL,
  browserName,
}) => {
  test.setTimeout(360_000)
  const origin = new URL(baseURL!).origin
  const phoneElsewhere: string[] = []
  watchOrigin(context, origin, phoneElsewhere)

  // ---- The phone -------------------------------------------------------------
  await prepareForOffline(page)
  await context.setOffline(true)

  // Flood exposure: the three one-person households the demo taps.
  await openPage(page, '/watch')
  await page.getByRole('button', { name: 'Mark more people exposed' }).click()
  for (const id of ['HH-03', 'HH-07', 'HH-10']) {
    const household = page.getByRole('button', { name: new RegExp(`^${id}.*1 person$`) })
    await household.click()
    await expect(household).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByRole('button', { name: 'Confirm and start the watch' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Start the watch/ }).click()
  await expect(page.getByText('Watch started for 3 people.')).toBeVisible()

  // Stock: the demo box, typed in with the label's values (no camera).
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

  // Exposure × stock: the demo's three numbers, then the flag.
  const metric = (label: string) => page.locator('p').filter({ hasText: label })
  await openPage(page, '/compare')
  await expect(metric('people exposed to floodwater')).toHaveText(/^12\D/)
  await expect(metric('doxycycline capsules on hand')).toHaveText(/^40\D/)
  await expect(metric('of them expire within 6 weeks')).toHaveText(/^30\D/)
  await page.getByRole('button', { name: 'Flag for clinician review' }).click()
  await expect(page.getByText('Flagged for clinician review', { exact: true })).toBeVisible()

  // Send: the one-time pairing QR (with the fingerprint the officer compares),
  // then this week's counts QR. Their texts are what a camera would read.
  await openPage(page, '/send')
  await page.getByRole('button', { name: 'Pair with the RHU laptop' }).click()
  const sheet = page.getByRole('dialog', { name: 'Pair with the RHU laptop' })
  const pairingText = await sheet.getByRole('img', { name: 'Pairing QR for SID-MAL' }).getAttribute('data-qr-text')
  expect(pairingText).toMatch(/^AGPK1\./)
  const phoneFingerprint = (await sheet.getByText(/^The laptop must show this code:/).textContent())?.match(FINGERPRINT)?.[0]
  expect(phoneFingerprint).toBeTruthy()
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name: /^Show the QR/ }).click()
  const countsText = await page.getByRole('img', { name: "QR code with this week's counts" }).getAttribute('data-qr-text')
  expect(countsText).toMatch(/^AGP1\./)

  // ---- The municipal laptop ---------------------------------------------------
  const laptop = await browser.newContext()
  const laptopElsewhere: string[] = []
  watchOrigin(laptop, origin, laptopElsewhere)
  try {
    const desk = await laptop.newPage()
    await desk.goto('/municipal')
    await expect(desk.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
    // The worker must control the page before the network goes away.
    await desk.waitForFunction(() => navigator.serviceWorker.controller !== null)
    await laptop.setOffline(true)
    const reopened = await desk.goto('/municipal')
    // Chromium-only in Playwright (see offline.spec.ts).
    if (browserName === 'chromium') expect(reopened?.fromServiceWorker()).toBe(true)
    await expect(desk.getByRole('heading', { level: 1, name: 'Barangay reports' })).toBeVisible()

    // No camera on this laptop: the scan screen's fallback takes the QR text.
    await desk.getByRole('button', { name: 'Scan a barangay QR' }).click()
    await expect(desk.getByRole('heading', { level: 1, name: 'Scan a barangay QR' })).toBeVisible()
    await desk.getByText('No camera? Use a photo or the QR text', { exact: true }).click()
    const qrText = desk.getByLabel('QR text (starts with AGP1. or AGPK1.)', { exact: true })
    const check = desk.getByRole('button', { name: 'Check this QR text' })

    // Pairing: the laptop shows the same fingerprint as the phone; the officer confirms.
    await qrText.fill(pairingText!)
    await check.click()
    await expect(desk.getByRole('status').filter({ hasText: "Pair Maligaya-D's phone?" })).toContainText(phoneFingerprint!)
    const pair = desk.getByRole('button', { name: 'They match: pair Maligaya-D' })
    await pair.click()
    await expect(pair).toHaveCount(0)

    // The counts QR, verified against the key just paired. The "Received this
    // week" list marks Maligaya-D "Just now" (the result banner can sit under
    // the camera's own banner on a laptop with no camera).
    await qrText.fill(countsText!)
    await check.click()
    await expect(desk.getByRole('listitem').filter({ hasText: 'Maligaya-D' })).toContainText('Just now')

    // Merged view: Maligaya-D's counts as the phone sent them, beside the four samples.
    await desk.getByRole('link', { name: /^Merged view \(\d of 5\)$/ }).click()
    await expect(desk.getByRole('heading', { level: 1, name: 'Merged view' })).toBeVisible()
    await expect(desk.getByText(/· 5 of 5 barangays/)).toBeVisible()
    for (const name of BARANGAYS) {
      const row = desk.getByRole('row', { name: new RegExp(`^${name}`) })
      await expect(row).toBeVisible()
      await expect(row).not.toContainText('Waiting')
    }
    // Cells after the name: received, exposed, in watch window, fast breathing,
    // doxycycline on hand, expiring in 6 weeks.
    const maligaya = desk.getByRole('row', { name: /^Maligaya-D/ }).getByRole('cell')
    await expect(maligaya.nth(0)).toHaveText(/#1$/)
    await expect(maligaya.nth(2)).toHaveText('9')
    await expect(maligaya.nth(4)).toHaveText('40')
    await expect(maligaya.nth(5)).toHaveText('30')
    await expect(desk.getByRole('rowheader', { name: 'All 5 barangays' })).toBeVisible()

    // The plan from the fixed rules, approved as listed: no wording, no AI.
    await desk.getByRole('link', { name: 'Make the plan' }).click()
    await expect(desk.getByRole('heading', { level: 1, name: /^Plan for week \d{4}-W\d{2}$/ })).toBeVisible()
    await expect(desk.getByText(/^From 5 of 5 barangays/)).toBeVisible()
    await expect(desk.getByRole('heading', { level: 2, name: 'The plan' })).toBeVisible()
    await expect(desk.getByRole('textbox', { name: 'Plan wording' })).toHaveValue('')
    const approve = desk.getByRole('button', { name: 'Approve plan' })
    await approve.click()
    await expect(desk.getByText('Plan approved and saved to the log.')).toBeVisible()
    await expect(approve).toBeDisabled()

    // The approval log has the entry: the role, all five barangays, rules only.
    await desk.getByRole('navigation', { name: 'Municipal' }).getByRole('link', { name: 'Approval log' }).click()
    await expect(desk.getByRole('heading', { level: 1, name: 'Approval log' })).toBeVisible()
    const entry = desk.getByRole('row').filter({ hasText: 'Municipal health officer' })
    await expect(entry).toHaveCount(1)
    await expect(entry).toContainText('5 of 5 barangays')
    await expect(entry).toContainText('Rules only')
  } finally {
    await laptop.close()
  }

  expect(phoneElsewhere, 'phone requests to other origins').toEqual([])
  expect(laptopElsewhere, 'laptop requests to other origins').toEqual([])
})

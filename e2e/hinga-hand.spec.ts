import { expect, test, type Locator, type Page } from '@playwright/test'
import type { HingaCheck } from '../src/data/db/types'

// Hinga with no camera, counted by hand (3d, then L8b). There's no fake camera
// here, so the runner has none and getUserMedia fails. The permission is
// granted, so 3c is skipped and the flow lands on 3d. page.clock drives the
// minute: the clock starts at the first tap, and the rate is the taps in the
// full minute (handCount.ts). 45 taps in the 40 cut-off band is fast breathing.
// Save needs a danger-sign answer, and the check is saved with method 'hand'.

test.use({ permissions: ['camera'] })

// The 40 cut-off band, by its old label or its pass 1b label.
const BAND = '(12 months up to 5 years|1 to 4 years)'

// A checkbox or radio row: the input is visually hidden and its label takes the tap.
const row = (page: Page, control: Locator) => page.locator('label').filter({ has: control })

test('no camera: 45 breaths counted by hand are fast for 1 to 4 years and saved as a hand count', async ({ page }) => {
  test.setTimeout(120_000)
  page.on('console', (message) => {
    if (message.text().startsWith('Hinga: no camera')) console.log('Camera error (CI runner):', message.text())
  })

  // Fake timers from the first load; time runs normally until pauseAt.
  await page.clock.install()
  await page.goto('/hinga')
  await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
  const hinga = page.locator('[data-hinga-screen]')
  await expect(hinga).toHaveAttribute('data-hinga-screen', 'age', { timeout: 30_000 })

  // 2a: the band and the readiness tick.
  const band = page.getByRole('radio', { name: new RegExp(`^${BAND}`) })
  await row(page, band).click()
  await expect(band).toBeChecked()
  const calm = page.getByRole('checkbox')
  await row(page, calm).click()
  await expect(calm).toBeChecked()
  await page.getByRole('button', { name: /^Next/ }).click()

  // 3d: the camera didn't open. Count by hand.
  await expect(hinga).toHaveAttribute('data-hinga-screen', 'camera-blocked', { timeout: 30_000 })
  await expect(hinga).toHaveAttribute('data-hinga-camera', 'blocked')
  await page.getByRole('dialog').getByRole('button', { name: /^Count by hand/ }).click()
  await expect(hinga).toHaveAttribute('data-hinga-screen', 'hand-count')

  // L8b with time stopped: it moves only when the test moves it.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000)
  const timer = page.getByRole('timer')
  const tap = page.getByRole('button', { name: 'Tap for each breath' })
  await expect(timer).toHaveText('1:00')
  await page.clock.runFor(5_000)
  await expect(timer).toHaveText('1:00')
  // A tap a second: 45 taps take 44 s, then the rest of the minute passes. The
  // rate is the 45 taps, not 45 scaled up to a minute.
  for (let breath = 1; breath <= 45; breath++) {
    if (breath > 1) await page.clock.runFor(1_000)
    await tap.click()
  }
  await expect(tap).toContainText('45')
  await expect(timer).toHaveText('0:16')
  await page.clock.runFor(17_000)

  // 6a: fast breathing for the band, counted by hand.
  await expect(hinga).toHaveAttribute('data-hinga-screen', 'result')
  const result = page.getByRole('region', { name: /^Fast breathing/ })
  await expect(result.getByText('45', { exact: true })).toBeVisible()
  await expect(result).toContainText(new RegExp(`${BAND}\\D+40\\b`))
  await expect(page.getByText(new RegExp(`${BAND}.*Counted by hand`))).toBeVisible()

  // Save waits for a danger-sign answer.
  const save = page.getByRole('button', { name: /^Save/ })
  await expect(save).toBeDisabled()
  const none = page.getByRole('checkbox', { name: 'None of these', exact: true })
  await row(page, none).click()
  await expect(none).toBeChecked()
  await expect(save).toBeEnabled()
  await save.click()
  await expect(hinga).toHaveAttribute('data-hinga-screen', 'saved')

  // On the phone: the 'agapay' database, store 'hingaChecks' (src/data/db/db.ts).
  const checks = await page.evaluate(
    () =>
      new Promise<HingaCheck[]>((resolve, reject) => {
        const open = indexedDB.open('agapay')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const all = db.transaction('hingaChecks').objectStore('hingaChecks').getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            db.close()
            resolve(all.result)
          }
        }
      }),
  )
  expect(checks.filter((check) => !check.sample)).toEqual([
    expect.objectContaining({ method: 'hand', breathsPerMinute: 45, outcome: 'fast', dangerSigns: [], refusal: null }),
  ])
})

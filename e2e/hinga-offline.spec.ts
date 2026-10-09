import { expect, test } from '@playwright/test'
import { prepareForOffline } from './prepare'

// Hinga in airplane mode with Chromium's fake camera and microphone. The fake
// camera shows a test pattern, not a person (we use no real people), so this
// checks the no-torso path: the torso finder starts on the device, finds no
// chest, and the count refuses to start. A person in view is tested by hand.

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['camera', 'microphone'],
})

test('Hinga starts its models offline and will not count without a chest in view', async ({ page, context, baseURL }) => {
  test.setTimeout(300_000)
  const origin = new URL(baseURL!).origin
  const elsewhere: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:')) elsewhere.push(url)
  })

  await prepareForOffline(page)

  await context.setOffline(true)
  await page.goto('/hinga')
  const hinga = page.locator('[data-hinga-screen]')

  // The torso finder starts on the device: in a worker, or on the page itself.
  await expect(hinga).toHaveAttribute('data-hinga-model', /^ready:(worker|main-thread)$/, { timeout: 120_000 })
  console.log('Hinga model status (CI runner):', await hinga.getAttribute('data-hinga-model'))
  await expect(hinga).toHaveAttribute('data-hinga-cry', /^(ready|off)$/, { timeout: 120_000 })

  // Step 1: the age band and the readiness tick.
  // Pass 1b renames the band to "1 to 4 years"; either label is the 40 cut-off.
  await page.getByText(/^(12 months up to 5 years|1 to 4 years)$/).first().click()
  await page.getByText('The child is calm: not crying, not feeding, and the chest is visible.').click()
  await page.getByRole('button', { name: 'Next: point the camera' }).click()

  // Framing: the camera is already allowed (no 3c), and the fake camera shows
  // no person, so no chest and no count.
  await expect(hinga).toHaveAttribute('data-hinga-screen', 'framing')
  await expect(hinga).toHaveAttribute('data-hinga-camera', 'on', { timeout: 60_000 })
  await page.waitForTimeout(3_000)
  await expect(page.getByText('Looking for the chest…')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start counting' })).toBeDisabled()

  expect(elsewhere, 'requests to other origins').toEqual([])
})

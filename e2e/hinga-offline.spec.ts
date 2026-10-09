import { expect, test } from '@playwright/test'

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

  await page.goto('/prepare')
  await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await page.getByRole('button', { name: 'Prepare for offline' }).click()
  await expect(page.locator('[data-prepare-status]')).toHaveAttribute('data-prepare-status', 'ready', { timeout: 180_000 })

  await context.setOffline(true)
  await page.goto('/hinga')

  // The torso finder starts on the device: in a worker, or on the page with the reason shown.
  const model = page.getByText(/^Torso finder ready on this phone \((in a background worker|on the page itself)\)\.$/)
  await expect(model).toBeVisible({ timeout: 120_000 })
  if ((await model.textContent())?.includes('on the page itself')) {
    await expect(page.getByText(/^Running on the page itself because /)).toBeVisible()
  }
  console.log('Hinga model status (CI runner):', await model.textContent())
  await expect(page.getByText(/^Cry check: ready\.|^Cry check off: /)).toBeVisible({ timeout: 120_000 })

  // Setup: an 18-month-old typed in, every readiness box ticked.
  await page.getByLabel('Age in months').fill('18')
  await expect(page.getByText(/^Age band: .*Fast breathing is 40 breaths per minute or more \(WHO IMCI\)\.$/)).toBeVisible()
  for (const box of await page.getByRole('checkbox').all()) await box.check()
  await page.getByRole('button', { name: 'Next: frame the chest' }).click()

  // Framing: the fake camera shows no person, so no torso and no count.
  await expect(page.getByRole('heading', { name: 'Frame the chest' })).toBeVisible()
  const start = page.getByRole('button', { name: 'Start the camera' })
  if (await start.isVisible()) await start.click()
  await expect(page.getByText('No torso found: show the head, shoulders and chest.')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Start the 60 s count' })).toBeDisabled()

  expect(elsewhere, 'requests to other origins').toEqual([])
})

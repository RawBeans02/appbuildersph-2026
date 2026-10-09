import { expect, test } from '@playwright/test'

// "Measure this device" works end to end offline (CI runner, fake camera):
// every measurement fills in, the demo label is read right, and the table row
// has a value in every timing column. The numbers are runner numbers, not
// phone speed; they aren't asserted, only logged.

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['camera', 'microphone'],
})

test('measures the reader, pose model, camera rate and cry check offline', async ({ page, context }) => {
  test.setTimeout(300_000)
  await page.goto('/prepare')
  await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await page.getByRole('button', { name: 'Prepare for offline' }).click()
  await expect(page.locator('[data-prepare-status]')).toHaveAttribute('data-prepare-status', 'ready', { timeout: 180_000 })

  await context.setOffline(true)
  await page.goto('/device')
  await page.getByLabel(/^Device name/).fill('CI runner (headless Chromium)')
  const measuring = page.getByText(/^Measuring: /)

  for (const name of [
    'Measure the box reader',
    'Measure the pose model start',
    /^Measure camera frames per second/,
    'Measure the cry check start',
  ]) {
    await page.getByRole('button', { name }).click()
    await expect(measuring).toBeHidden({ timeout: 120_000 })
  }

  const value = (term: string) => page.locator('dt', { hasText: term }).locator('xpath=following-sibling::dd[1]')
  await expect(value('Demo label read right')).toHaveText('yes')
  await expect(value('Box reader: first read of the demo label')).toHaveText(/^\d+ ms$/)
  await expect(value('Pose model start: first, then second')).toHaveText(/^\d+ ms, \d+ ms \((worker|main thread .*)\)$/)
  await expect(value('Camera frames per second')).toHaveText(/^\d+\.\d/)
  await expect(value('Cry check start')).toHaveText(/^\d+ ms$/)

  await page.getByRole('button', { name: 'Copy as a table row' }).click()
  const row = await page.getByLabel(/^Table row/).inputValue()
  console.log('Measure this device (CI runner):', row)
  expect(row).toMatch(/^\| .* \| CI runner \(headless Chromium\) \| /)
  expect(row).not.toMatch(/\| – \|/)
})

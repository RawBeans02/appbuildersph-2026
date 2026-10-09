import { expect, test } from '@playwright/test'
import { prepareForOffline } from './prepare'
import { openPage } from './lock'

// "Measure this device" works end to end offline (CI runner, fake camera):
// every measurement fills in (the PIN key's PBKDF2 run too), the demo label is
// read right, and the table row has a value in every timing column. The
// numbers are runner numbers, not phone speed; they aren't asserted, only
// logged.

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['camera', 'microphone'],
})

test('measures the reader, pose model, camera rate, cry check and PIN key offline', async ({ page, context }) => {
  test.setTimeout(300_000)
  await prepareForOffline(page)

  await context.setOffline(true)
  await openPage(page, '/device')
  await page.getByLabel(/^Device name/).fill('CI runner (headless Chromium)')
  const measuring = page.getByText(/^Measuring: /)

  for (const name of [
    'Measure the box reader',
    'Measure the pose model start',
    /^Measure camera frames per second/,
    'Measure the cry check start',
    'Measure the PIN key',
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
  await expect(value('PIN key (PBKDF2, 600,000 iterations)')).toHaveText(/^\d+ ms$/)

  await page.getByRole('button', { name: 'Copy as a table row' }).click()
  const row = await page.getByLabel(/^Table row/).inputValue()
  console.log('Measure this device (CI runner):', row)
  expect(row).toMatch(/^\| .* \| CI runner \(headless Chromium\) \| /)
  expect(row).not.toMatch(/\| – \|/)
})

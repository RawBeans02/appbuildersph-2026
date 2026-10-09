import { expect, test } from '@playwright/test'

// "Reset sample data" on /device puts the records back to today's seed and
// keeps the model caches, so Demo Day never re-downloads the models.

test('reset brings the seed back and keeps the downloaded models', async ({ page }) => {
  const startsSoon = page.getByRole('heading', { level: 2, name: /^Starts soon \d+$/ })
  await page.goto('/watch')
  await expect(page.getByRole('heading', { level: 2, name: /^In the window now \d+$/ })).toBeVisible({ timeout: 30_000 })
  await expect(startsSoon).toHaveCount(0)
  await page.getByRole('button', { name: 'Mark more people exposed' }).click()
  await page.getByRole('button', { name: /^HH-03.*1 person$/ }).click()
  await page.getByRole('button', { name: 'Confirm and start the watch' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Start the watch/ }).click()
  await expect(startsSoon).toHaveText(/ 1$/)

  // A stand-in for a downloaded model, in the cache the app's models use.
  await page.evaluate(async () => {
    const cache = await caches.open('model-cache:e2e-model@1')
    await cache.put('/models/e2e/model.bin', new Response('weights', { headers: { 'x-model-bytes': '7' } }))
  })

  await page.goto('/device')
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Reset sample data', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: "Sample data reset to today's dates." })).toBeVisible()

  await page.goto('/watch')
  await expect(page.getByRole('heading', { level: 2, name: /^In the window now \d+$/ })).toBeVisible()
  await expect(startsSoon).toHaveCount(0)
  const kept = await page.evaluate(async () => (await caches.open('model-cache:e2e-model@1')).match('/models/e2e/model.bin'))
  expect(kept).not.toBeNull()
})

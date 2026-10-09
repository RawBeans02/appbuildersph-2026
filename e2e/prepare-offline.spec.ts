import { expect, test } from '@playwright/test'
import { prepareForOffline } from './prepare'
import { openPage } from './lock'

// "Prepare for offline" downloads the models and the runtime .wasm into the
// model caches; with no network afterwards, the screen still says ready and
// the service worker serves those files from the cache.

test('prepared models and the runtime .wasm load with no network', async ({ page, context }) => {
  test.setTimeout(120_000)
  await prepareForOffline(page)

  await context.setOffline(true)
  await openPage(page, '/prepare')
  // Already cached: straight to ready, no download.
  await expect(page.locator('[data-prepare-status]')).toHaveAttribute('data-prepare-status', 'ready')
  await expect(page.getByRole('heading', { level: 1, name: 'Runs on this phone' })).toBeVisible()

  const files = await page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) {
      if (!name.startsWith('model-cache:')) continue
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url)
    }
    return Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url)
        return { url, ok: response.ok, bytes: (await response.arrayBuffer()).byteLength }
      }),
    )
  })
  expect(files.find((file) => file.url.endsWith('/models/ppocr/det.onnx'))).toMatchObject({ ok: true, bytes: 4_826_518 })
  expect(files.find((file) => /\/ort-wasm[^/]*\.wasm$/.test(file.url))).toMatchObject({ ok: true, bytes: 14_239_897 })
})

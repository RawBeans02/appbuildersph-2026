import { expect, test } from '@playwright/test'
import { openPage } from './lock'

// WebKit only, a diagnostic for the iPhone (A18): does MediaPipe's pose model
// run on the MAIN THREAD here (poseTracker.ts's fallback when the worker
// can't start)? In the worker it fails in headless WebKit on Linux with
// "WebGL 2 … GLctx.activeTexture", since that WebKit has no WebGL. The Hinga
// spike page (spike-hinga.html) runs the same model, CPU delegate, VIDEO mode,
// on the main thread, against WebKit's mock camera. Result in CI (A18): the
// model loads and detection runs on the main thread ("No torso found"); only
// the worker path needs WebGL there.

test.use({ permissions: ['camera'] })

test('pose model on the main thread in WebKit (diagnostic)', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'a WebKit-only diagnostic')
  test.setTimeout(180_000)
  const consoleLines: string[] = []
  page.on('console', (message) => {
    if (/webgl|GLctx|pose/i.test(message.text())) consoleLines.push(`${message.type()}: ${message.text().slice(0, 200)}`)
  })
  await page.goto('/spike-hinga.html')
  const prepare = page.locator('#prepare')
  const model = page.locator('#model')
  await expect(prepare.or(model.filter({ hasText: /^Pose model ready|^Could not load/ }))).toBeVisible({ timeout: 60_000 })
  if (await prepare.isVisible()) await prepare.click()
  await expect(model).toHaveText(/^Pose model ready|^Could not load the pose model/, { timeout: 120_000 })
  const modelText = (await model.textContent()) ?? ''
  console.log('WebKit main-thread pose model:', modelText)

  let statusText = ''
  if (modelText.startsWith('Pose model ready')) {
    await page.locator('#camera').click()
    // The spike reports each frame: "No torso found…" or the torso found means
    // detectForVideo ran on the frames.
    await expect(page.locator('#status')).toHaveText(/Camera on|torso|Torso|Pose detection failed|Could not open the camera|did not start/, { timeout: 30_000 })
    // A few seconds of frames through detectForVideo.
    await page.waitForTimeout(4_000)
    statusText = (await page.locator('#status').textContent()) ?? ''
    console.log('WebKit main-thread pose detection status:', statusText)
  }
  console.log('WebKit main-thread pose console:', consoleLines.slice(0, 6).join(' || ') || '(none)')
  expect(modelText).toMatch(/^Pose model ready/)
  expect(statusText).not.toMatch(/Pose detection failed/)
})

// The app itself on WebKit (7b064a3): the pose model starts on the page, not
// in a worker, and framing runs on the mock camera instead of falling to L9b.
test('/hinga in WebKit: the pose model runs on the page itself and framing works', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'a WebKit-only check')
  test.setTimeout(180_000)
  await openPage(page, '/hinga')
  const hinga = page.locator('[data-hinga-screen]')
  await expect(hinga).toHaveAttribute('data-hinga-model', 'ready:main-thread', { timeout: 120_000 })

  const band = page.getByRole('radio', { name: /^(12 months up to 5 years|1 to 4 years)/ })
  await page.locator('label').filter({ has: band }).click()
  const calm = page.getByRole('checkbox')
  await page.locator('label').filter({ has: calm }).click()
  await page.getByRole('button', { name: /^Next/ }).click()

  await expect(hinga).toHaveAttribute('data-hinga-screen', 'framing')
  await expect(hinga).toHaveAttribute('data-hinga-camera', 'on', { timeout: 60_000 })
  // A few seconds of frames through the model on the page: still framing.
  await page.waitForTimeout(4_000)
  await expect(hinga).toHaveAttribute('data-hinga-screen', 'framing')
  await expect(hinga).toHaveAttribute('data-hinga-model', 'ready:main-thread')
})

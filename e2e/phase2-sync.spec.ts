import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openPage } from './lock'

// Phase 2's laptop Sync screen and DOH view (P2-B). Runs in both CI e2e
// entries: with the flag off, both paths are the 404 and the laptop has no
// Sync item; with VITE_PHASE2=1, they render, and offline they wait while the
// laptop's core screens keep working. There is no API behind `vite preview`,
// so this also shows the screens handle an unreachable server; the backend
// itself is tested against Postgres in the CI `api` job.

async function phase2On(page: Page): Promise<boolean> {
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-lock-status', /^(off|setup|locked|unlocked)$/, { timeout: 30_000 })
  return (await html.getAttribute('data-lock-status')) !== 'off'
}

async function noSeriousViolations(page: Page, what: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  for (const violation of violations) console.log(`a11y ${what}: [${violation.impact}] ${violation.id}: ${violation.help}`)
  const serious = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical').map((v) => v.id)
  expect(serious, `serious or critical accessibility violations on ${what}`).toEqual([])
}

test.use({ viewport: { width: 1280, height: 800 } })

test('phase 2 off: no Sync item, and /municipal/sync and /doh are the 404', async ({ page }) => {
  await page.goto('/municipal')
  test.skip(await phase2On(page), 'phase 2 is on in this build')
  await expect(page.getByRole('heading', { level: 1, name: 'Barangay reports' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('navigation', { name: 'Municipal' }).getByRole('link', { name: 'Sync' })).toHaveCount(0)
  for (const path of ['/municipal/sync', '/doh']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: 'Walang ganitong page.' })).toBeVisible({ timeout: 30_000 })
  }
  // P2-C: no messages card on the phone's Home.
  await openPage(page, '/')
  await expect(page.getByRole('heading', { level: 2, name: /^Today, / })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Messages from the municipality' })).toHaveCount(0)
})

test("phase 2 on: the phone's Home shows the messages card online, and hides it offline", async ({ page, context }) => {
  await openPage(page, '/')
  test.skip(!(await phase2On(page)), 'phase 2 is off in this build')
  await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const card = page.getByRole('heading', { name: 'Messages from the municipality' })
  await expect(card).toBeVisible({ timeout: 30_000 })
  // The sample phone hasn't paired yet, and there's no server here.
  await expect(page.getByText(/once this phone is paired|Couldn't check for messages/)).toBeVisible({ timeout: 30_000 })
  await context.setOffline(true)
  await expect(card).toHaveCount(0)
})

test('phase 2 on: the Sync screen asks to register, says when the server is unreachable, and waits offline', async ({ page, context }) => {
  await page.goto('/municipal')
  test.skip(!(await phase2On(page)), 'phase 2 is off in this build')
  await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await page.getByRole('navigation', { name: 'Municipal' }).getByRole('link', { name: 'Sync' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sync' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 2, name: 'Register this laptop' })).toBeVisible()
  await noSeriousViolations(page, '/municipal/sync')

  // No API here: registering says so, and nothing else changes.
  await page.getByLabel('Enroll code', { exact: true }).fill('e2e-not-a-real-code')
  await page.getByRole('button', { name: 'Register this laptop' }).click()
  await expect(page.getByRole('alert').filter({ hasText: "Couldn't reach the sync server" })).toBeVisible({ timeout: 30_000 })

  await context.setOffline(true)
  await expect(page.getByRole('heading', { name: 'Sync waits for internet.' })).toBeVisible()
  await expect(page.getByText('Everything else works offline.')).toBeVisible()

  // The laptop's core still opens offline, from the service worker.
  await page.goto('/municipal/merged')
  await expect(page.getByRole('heading', { level: 1, name: 'Merged view' })).toBeVisible({ timeout: 30_000 })
  await page.goto('/municipal/sync')
  await expect(page.getByRole('heading', { name: 'Sync waits for internet.' })).toBeVisible({ timeout: 30_000 })
})

test('phase 2 on: the DOH view asks for its code online and needs internet offline', async ({ page, context }) => {
  await page.goto('/doh')
  test.skip(!(await phase2On(page)), 'phase 2 is off in this build')
  await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
  // Not behind the phone's PIN.
  await expect(page.getByRole('heading', { level: 1, name: 'Barangay reports' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('View code', { exact: true })).toBeVisible()
  await noSeriousViolations(page, '/doh')

  await page.getByLabel('View code', { exact: true }).fill('e2e-not-a-real-code')
  await page.getByRole('button', { name: 'Open the reports' }).click()
  await expect(page.getByRole('heading', { name: "Couldn't reach the sync server" })).toBeVisible({ timeout: 30_000 })

  // P2-C: the alerts panel renders, and with no server it says the AI is off.
  await expect(page.getByRole('heading', { level: 2, name: 'Draft alerts with GPT-6 Luna' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-ai="off"]')).toContainText('AI off', { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Draft alerts' })).toBeDisabled()
  await noSeriousViolations(page, '/doh (alerts panel)')

  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'The DOH view needs internet.' })).toBeVisible({ timeout: 30_000 })
})

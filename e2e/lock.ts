import { expect, type Page } from '@playwright/test'

// Phase 2's PIN lock (VITE_PHASE2): every reload of a phone screen starts
// locked. openPage loads a path and, when the lock screen shows, unlocks with
// the sample data PIN it displays. With phase 2 off (data-lock-status "off")
// it's a plain goto. The municipal laptop's screens are never behind the PIN.
export async function openPage(page: Page, path: string) {
  const response = await page.goto(path)
  await unlockIfLocked(page)
  return response
}

export async function unlockIfLocked(page: Page) {
  if (new URL(page.url()).pathname.startsWith('/municipal')) return
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-lock-status', /^(off|setup|locked|unlocked)$/, { timeout: 30_000 })
  if ((await html.getAttribute('data-lock-status')) !== 'locked') return
  const pin = (await page.locator('[data-demo-pin]').textContent())?.trim() ?? ''
  expect(pin, 'the lock screen shows the sample data PIN').toMatch(/^\d{4,6}$/)
  await page.getByLabel('PIN', { exact: true }).fill(pin)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(html).toHaveAttribute('data-lock-status', 'unlocked', { timeout: 30_000 })
}

import { expect, test, type Page } from '@playwright/test'

// Phase 2's PIN lock end to end (VITE_PHASE2; skipped when the build has it
// off): a wrong PIN is refused, the sample data PIN opens the records, the
// personal fields are sealed at rest, a reload locks again, and "Forgot the
// PIN?" erases the records and brings the sample data back, locked.

const residentKeys = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[][]>((resolve, reject) => {
        const open = indexedDB.open('agapay')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const all = db.transaction('residents').objectStore('residents').getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            db.close()
            resolve((all.result as Record<string, unknown>[]).map((record) => Object.keys(record).sort()))
          }
        }
      }),
  )

test('the PIN lock: wrong PIN, sample PIN, sealed at rest, locked on reload, forgot', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-lock-status', /^(off|setup|locked|unlocked)$/, { timeout: 30_000 })
  test.skip((await html.getAttribute('data-lock-status')) === 'off', 'phase 2 is off in this build')

  await expect(page.getByRole('heading', { level: 1, name: 'Enter your PIN' })).toBeVisible()
  const pin = (await page.locator('[data-demo-pin]').textContent())?.trim() ?? ''
  expect(pin).toMatch(/^\d{4,6}$/)
  const field = page.getByLabel('PIN', { exact: true })
  const unlock = page.getByRole('button', { name: 'Unlock' })

  // A wrong PIN: refused, still locked (the first two wrong tries don't wait).
  await field.fill(pin === '0000' ? '1111' : '0000')
  await unlock.click()
  await expect(field).toHaveAttribute('aria-invalid', 'true', { timeout: 30_000 })
  await expect(page.getByRole('status').filter({ hasText: 'Wrong PIN.' })).toHaveCount(1)
  await expect(html).toHaveAttribute('data-lock-status', 'locked')

  // The sample data PIN opens Home.
  await field.fill(pin)
  await unlock.click()
  await expect(html).toHaveAttribute('data-lock-status', 'unlocked', { timeout: 30_000 })
  await expect(page.getByText('On the watch list', { exact: true })).toBeVisible({ timeout: 30_000 })

  // At rest, each resident is its id, the sample flag and one sealed box.
  const keys = await residentKeys(page)
  expect(keys.length).toBeGreaterThan(0)
  for (const record of keys) expect(record).toEqual(['id', 'sample', 'sealed'])

  // The key lives in the page only: a reload starts locked.
  await page.reload()
  await expect(html).toHaveAttribute('data-lock-status', 'locked', { timeout: 30_000 })

  // Forgot the PIN: erase after a confirm; the sample data comes back, locked.
  await page.getByRole('button', { name: 'Forgot the PIN?' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Erase the records' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })
  await expect(html).toHaveAttribute('data-lock-status', 'locked')
  await field.fill(pin)
  await unlock.click()
  await expect(html).toHaveAttribute('data-lock-status', 'unlocked', { timeout: 30_000 })
  await expect(page.getByText('On the watch list', { exact: true })).toBeVisible({ timeout: 30_000 })
})

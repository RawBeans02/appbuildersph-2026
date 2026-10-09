import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

// Automated accessibility check (axe-core, WCAG 2.0/2.1 A and AA rules) on
// every screen with the sample data loaded: phone screens at 375 × 812, the
// municipal laptop at 1280 × 800. A serious or critical violation fails the
// screen's test; every violation, of any impact, is logged for the record.
// axe finds what can be checked by machine (contrast, names, roles, labels);
// it doesn't replace checking by hand with a screen reader.

type Screen = { path: string; ready: (page: Page) => Locator }

const PHONE: Screen[] = [
  { path: '/', ready: (page) => page.getByText('On the watch list', { exact: true }) },
  { path: '/prepare', ready: (page) => page.getByRole('heading', { level: 1, name: 'Get Agapay ready for no signal' }) },
  { path: '/watch', ready: (page) => page.getByRole('heading', { level: 2, name: /^In the window now/ }) },
  { path: '/stock', ready: (page) => page.getByRole('heading', { level: 2, name: 'All stock' }) },
  { path: '/compare', ready: (page) => page.getByText('people exposed to floodwater') },
  { path: '/send', ready: (page) => page.getByRole('button', { name: /^Show the QR/ }) },
  { path: '/privacy', ready: (page) => page.getByRole('heading', { level: 1, name: 'Privacy & AI' }) },
  { path: '/hinga', ready: (page) => page.locator('[data-hinga-screen="age"]') },
  { path: '/device', ready: (page) => page.getByRole('heading', { level: 1, name: 'Device check' }) },
  { path: '/no-such-page', ready: (page) => page.getByRole('heading', { level: 1, name: 'Walang ganitong page.' }) },
]

const LAPTOP: Screen[] = [
  { path: '/municipal', ready: (page) => page.getByRole('heading', { level: 1, name: 'Barangay reports' }) },
  { path: '/municipal/merged', ready: (page) => page.getByRole('heading', { level: 1, name: 'Merged view' }) },
  { path: '/municipal/plan', ready: (page) => page.getByRole('heading', { level: 1, name: /^Plan for week/ }) },
  { path: '/municipal/log', ready: (page) => page.getByRole('heading', { level: 1, name: 'Approval log' }) },
]

const SERIOUS = new Set(['serious', 'critical'])

async function checkScreen(page: Page, { path, ready }: Screen) {
  await page.goto(path)
  await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
  // Each screen's loaded state (not its skeleton or loading line).
  await expect(ready(page)).toBeVisible({ timeout: 30_000 })

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  for (const violation of violations) {
    const targets = violation.nodes.map((node) => node.target.join(' ')).slice(0, 5)
    console.log(`a11y ${path}: [${violation.impact}] ${violation.id}: ${violation.help} (${violation.nodes.length}) ${targets.join(' | ')}`)
  }
  const serious = violations
    .filter((violation) => SERIOUS.has(violation.impact ?? ''))
    .map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => node.target.join(' ')) }))
  expect(serious, `serious or critical accessibility violations on ${path}`).toEqual([])
}

test.describe('phone screens, 375 × 812', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  for (const screen of PHONE) {
    test(`axe: ${screen.path}`, async ({ page }) => checkScreen(page, screen))
  }
})

test.describe('municipal laptop, 1280 × 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  for (const screen of LAPTOP) {
    test(`axe: ${screen.path}`, async ({ page }) => checkScreen(page, screen))
  }
})

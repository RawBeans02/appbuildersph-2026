import type { Exposure, Resident, SeedData, StockLot } from '../../data/db/types'
import { DEMO_SCAN_LABEL } from '../../data/seed/demoLabel'
import { summarizeDoxycycline } from '../../rules/stock'
import { watchList } from '../../rules/watch'

// "Demo readiness" on /device: green or red rows the owner checks before going
// on stage, each with a one-tap fix where there is one. Pure: the facts are
// gathered elsewhere (gatherReadiness.ts), so every rule here is unit-tested.

// The demo taps these three one-person households on /watch (TASKS B4).
export const DEMO_HOUSEHOLDS = ['HH-03', 'HH-07', 'HH-10'] as const

export type Fix =
  | { kind: 'link'; to: string; label: string }
  | { kind: 'persist' }
  | { kind: 'reset' }
  | { kind: 'remove-lot'; id: string; lot: string }
  | { kind: 'make-identity' }

export type Check = {
  id: string
  label: string
  // null: couldn't tell on this browser.
  ok: boolean | null
  detail: string
  fix?: Fix
}

// What the sample data looks like on a fresh load today, from the seed itself.
export type SeedExpectation = { inWindow: number; capsulesOnHand: number }

export function expectFromSeed(seed: SeedData, today: string): SeedExpectation {
  const exposures = (seed.exposures ?? []).map((exposure) => ({ ...exposure, sample: true }))
  const lots = (seed.stockLots ?? []).map((lot) => ({ ...lot, sample: true }))
  return {
    inWindow: watchList(exposures, today).filter((entry) => entry.phase === 'active').length,
    capsulesOnHand: summarizeDoxycycline(lots, today).capsulesOnHand,
  }
}

// The live records' numbers to compare with that.
export function sampleNumbers(records: { exposures: Exposure[]; lots: StockLot[]; residents: Resident[] }, today: string) {
  const exposed = new Set(records.exposures.map((exposure) => exposure.residentId))
  const tapped = DEMO_HOUSEHOLDS.filter((household) =>
    records.residents.some((resident) => resident.householdId === household && exposed.has(resident.id)),
  )
  return {
    inWindow: watchList(records.exposures, today).filter((entry) => entry.phase === 'active').length,
    capsulesOnHand: summarizeDoxycycline(records.lots, today).capsulesOnHand,
    tapped,
  }
}

export type PhoneFacts = {
  today: string
  shell: { status: 'unavailable' | 'installing' | 'ready' | 'error'; controlled: boolean }
  // Phone models in the model cache, by their measured bytes.
  models: { cachedBytes: number; totalBytes: number; missing: string[] } | null
  persisted: boolean | null
  // null: no sample data loaded.
  sample: {
    loadedOn: string
    numbers: ReturnType<typeof sampleNumbers>
    expected: SeedExpectation
  } | null
  // The demo box's lot (DEMO-LOT-24A), if it's already in stock.
  demoLot: { id: string; lot: string } | null
  // Phase 2 only.
  lock: { status: string; demoPin: string | null } | null
  identity: { exports: number } | null
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`

export function phoneChecks(facts: PhoneFacts): Check[] {
  const checks: Check[] = []
  const { shell, models, sample } = facts

  const shellOk = shell.status === 'ready' && shell.controlled
  checks.push({
    id: 'shell',
    label: 'Opens offline',
    ok: shell.status === 'unavailable' ? false : shellOk,
    detail: shellOk
      ? 'The app is cached and the service worker controls this page.'
      : shell.status === 'installing'
        ? 'Still caching the app. Stay online, then reload.'
        : shell.status === 'ready'
          ? 'Cached, but this page isn’t controlled yet. Reload once.'
          : 'No service worker here. Open the live URL in the phone’s browser, online.',
  })

  checks.push(
    models === null
      ? { id: 'models', label: 'AI on this phone', ok: null, detail: 'This browser can’t say (no Cache API).' }
      : {
          id: 'models',
          label: 'AI on this phone',
          ok: models.missing.length === 0,
          detail:
            models.missing.length === 0
              ? `All downloaded: ${mb(models.totalBytes)}.`
              : `${mb(models.cachedBytes)} of ${mb(models.totalBytes)}. Missing: ${models.missing.join(', ')}.`,
          fix: models.missing.length === 0 ? undefined : { kind: 'link', to: '/prepare', label: 'Prepare for offline' },
        },
  )

  checks.push({
    id: 'persisted',
    label: 'Storage kept by the browser',
    ok: facts.persisted,
    detail:
      facts.persisted === null
        ? 'This browser can’t say.'
        : facts.persisted
          ? 'The browser won’t clear the AI or the records when space runs low.'
          : 'The browser may clear the downloaded AI when space runs low.',
    fix: facts.persisted === false ? { kind: 'persist' } : undefined,
  })

  if (sample === null) {
    checks.push({ id: 'sample', label: 'Sample data', ok: false, detail: 'No sample data on this phone.', fix: { kind: 'reset' } })
  } else {
    const { numbers, expected } = sample
    const problems: string[] = []
    if (sample.loadedOn !== facts.today) problems.push(`loaded ${sample.loadedOn}, not today`)
    if (numbers.inWindow !== expected.inWindow) problems.push(`${numbers.inWindow} in the watch window, expected ${expected.inWindow}`)
    if (numbers.tapped.length) problems.push(`${numbers.tapped.join(', ')} already tapped`)
    checks.push({
      id: 'sample',
      label: 'Sample data, fresh for today',
      ok: problems.length === 0,
      detail: problems.length
        ? `Not as the demo expects: ${problems.join('; ')}.`
        : `Dated today; ${expected.inWindow} in the watch window; ${DEMO_HOUSEHOLDS.join(', ')} not yet tapped.`,
      fix: problems.length ? { kind: 'reset' } : undefined,
    })
  }

  checks.push({
    id: 'demo-lot',
    label: 'Demo box not scanned yet',
    ok: facts.demoLot === null,
    detail:
      facts.demoLot === null
        ? sample
          ? `${sample.numbers.capsulesOnHand} doxycycline capsules on hand, so the live scan makes ${sample.numbers.capsulesOnHand + DEMO_SCAN_LABEL.quantity}.`
          : 'Not in stock.'
        : `${facts.demoLot.lot} is already in stock, so the live scan won't change the numbers.`,
    fix: facts.demoLot ? { kind: 'remove-lot', id: facts.demoLot.id, lot: facts.demoLot.lot } : undefined,
  })

  if (facts.lock) {
    checks.push({
      id: 'lock',
      label: 'PIN lock',
      ok: facts.lock.status === 'unlocked' || facts.lock.status === 'locked',
      detail:
        (facts.lock.status === 'setup' ? 'No PIN set yet.' : `Records sealed; ${facts.lock.status} now.`) +
        (facts.lock.demoPin ? ` Sample data PIN: ${facts.lock.demoPin}.` : ''),
    })
  }

  checks.push({
    id: 'identity',
    label: 'Signing key for the QR',
    ok: facts.identity !== null,
    detail: facts.identity
      ? `Ready; the pairing QR can be shown. ${facts.identity.exports} export${facts.identity.exports === 1 ? '' : 's'} so far.`
      : 'Not made yet; Send would make it on first use.',
    fix: facts.identity ? undefined : { kind: 'make-identity' },
  })

  return checks
}

export type LaptopFacts = {
  // Sample barangays paired from the seed, and how many of them have a QR in.
  sampleBarangays: { expected: number; paired: number; received: number }
  // Barangays paired for real (the live phone).
  phonesPaired: string[]
  aiCached: boolean | null
  camera: 'granted' | 'denied' | 'prompt' | null
}

export function laptopChecks(facts: LaptopFacts): Check[] {
  const { sampleBarangays: sample } = facts
  const sampleOk = sample.paired === sample.expected && sample.received === sample.expected
  return [
    {
      id: 'laptop-sample',
      label: 'Sample barangays loaded',
      ok: sampleOk,
      detail: `${sample.received} of ${sample.expected} received, ${sample.paired} paired.`,
      fix: sampleOk ? undefined : { kind: 'reset' },
    },
    {
      id: 'laptop-phone',
      label: 'The demo phone paired',
      ok: facts.phonesPaired.length > 0,
      detail: facts.phonesPaired.length
        ? `Paired: ${facts.phonesPaired.join(', ')}.`
        : 'No phone paired yet. Pair it from the phone’s Send screen before the demo.',
      fix: facts.phonesPaired.length ? undefined : { kind: 'link', to: '/municipal', label: 'Open the scan screen' },
    },
    {
      id: 'laptop-ai',
      label: 'Writing AI on this laptop',
      ok: facts.aiCached,
      detail:
        facts.aiCached === null
          ? 'This browser can’t say.'
          : facts.aiCached
            ? 'Downloaded; the plan’s wording runs on this laptop.'
            : 'Not downloaded. Optional: the plan works without it. Draft once online on the plan screen to download it.',
      fix: facts.aiCached === false ? { kind: 'link', to: '/municipal/plan', label: 'Open the plan' } : undefined,
    },
    {
      id: 'laptop-camera',
      label: 'Camera allowed',
      ok: facts.camera === null ? null : facts.camera === 'granted',
      detail:
        facts.camera === null
          ? 'This browser can’t say. The pasted-text fallback works without a camera.'
          : facts.camera === 'granted'
            ? 'The scan screen can start the camera.'
            : facts.camera === 'denied'
              ? 'Blocked. Allow it in the browser’s site settings, or use the pasted-text fallback.'
              : 'Not asked yet. Start the camera once on the scan screen.',
      fix: facts.camera === 'granted' ? undefined : { kind: 'link', to: '/municipal', label: 'Open the scan screen' },
    },
  ]
}

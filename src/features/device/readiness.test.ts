import { describe, expect, it } from 'vitest'
import { generateSeed } from '../../data/seed/generate'
import { DEMO_SCAN_LABEL } from '../../data/seed/demoLabel'
import { localToday } from '../../rules/dates'
import { DEMO_HOUSEHOLDS, expectFromSeed, laptopChecks, phoneChecks, sampleNumbers, type PhoneFacts } from './readiness'

// Noon UTC: the same calendar day wherever the tests run.
const NOW = new Date('2026-10-10T12:00:00Z')
const TODAY = localToday(NOW)
const seed = generateSeed(NOW)
const records = {
  residents: seed.residents.map((resident) => ({ ...resident, sample: true })),
  exposures: (seed.exposures ?? []).map((exposure) => ({ ...exposure, sample: true })),
  lots: (seed.stockLots ?? []).map((lot) => ({ ...lot, sample: true })),
}

const ready: PhoneFacts = {
  today: TODAY,
  shell: { status: 'ready', controlled: true },
  models: { cachedBytes: 55_717_165, totalBytes: 55_717_165, missing: [] },
  persisted: true,
  sample: { loadedOn: TODAY, numbers: sampleNumbers(records, TODAY), expected: expectFromSeed(seed, TODAY) },
  demoLot: null,
  lock: null,
  identity: { exports: 0 },
}

const failing = (facts: PhoneFacts) => phoneChecks(facts).filter((check) => check.ok !== true)

describe('demo readiness', () => {
  it('the seed has the demo households as untapped one-person households, 9 in the window and 10 capsules', () => {
    for (const household of DEMO_HOUSEHOLDS) {
      expect(records.residents.filter((resident) => resident.householdId === household)).toHaveLength(1)
    }
    expect(sampleNumbers(records, TODAY)).toEqual({ inWindow: 9, capsulesOnHand: 10, tapped: [] })
    expect(expectFromSeed(seed, TODAY)).toEqual({ inWindow: 9, capsulesOnHand: 10 })
  })

  it('a phone fresh for the demo is all green, and says the live scan makes 40', () => {
    expect(failing(ready)).toEqual([])
    expect(phoneChecks(ready).find((check) => check.id === 'demo-lot')?.detail).toMatch(/10 doxycycline capsules on hand, so the live scan makes 40\./)
  })

  it('flags stale or rehearsed sample data, with Reset as the fix', () => {
    const tappedResident = records.residents.find((resident) => resident.householdId === 'HH-03')!
    const rehearsed = {
      ...records,
      exposures: [
        ...records.exposures,
        { id: 'x', floodEventId: records.exposures[0].floodEventId, residentId: tappedResident.id, exposedOn: TODAY, kinds: ['waded' as const], createdAt: NOW.toISOString(), sample: false },
      ],
    }
    const check = failing({
      ...ready,
      sample: { loadedOn: '2026-10-01', numbers: sampleNumbers(rehearsed, TODAY), expected: expectFromSeed(seed, TODAY) },
    }).find((c) => c.id === 'sample')!
    expect(check.detail).toMatch(/loaded 2026-10-01, not today/)
    expect(check.detail).toMatch(/HH-03 already tapped/)
    expect(check.fix).toEqual({ kind: 'reset' })
  })

  it('flags the demo lot when it was already added, with Remove as the fix', () => {
    const check = failing({ ...ready, demoLot: { id: 'lot-1', lot: DEMO_SCAN_LABEL.lot } })[0]
    expect(check).toMatchObject({ id: 'demo-lot', fix: { kind: 'remove-lot', id: 'lot-1', lot: 'DEMO-LOT-24A' } })
  })

  it('flags missing models with their sizes and the Prepare link, and unpersisted storage with Request', () => {
    const checks = failing({ ...ready, models: { cachedBytes: 26_898_719, totalBytes: 55_717_165, missing: ['Breathing check'] }, persisted: false })
    expect(checks.map((check) => check.id)).toEqual(['models', 'persisted'])
    expect(checks[0].detail).toBe('26.9 MB of 55.7 MB. Missing: Breathing check.')
    expect(checks[0].fix).toEqual({ kind: 'link', to: '/prepare', label: 'Prepare for offline' })
    expect(checks[1].fix).toEqual({ kind: 'persist' })
  })

  it('flags a page the service worker does not control yet, and a missing signing key', () => {
    const checks = failing({ ...ready, shell: { status: 'ready', controlled: false }, identity: null })
    expect(checks.map((check) => check.id)).toEqual(['shell', 'identity'])
    expect(checks[1].fix).toEqual({ kind: 'make-identity' })
  })

  it('shows the PIN lock and the demo PIN when phase 2 is on', () => {
    const check = phoneChecks({ ...ready, lock: { status: 'unlocked', demoPin: '2468' } }).find((c) => c.id === 'lock')!
    expect(check).toMatchObject({ ok: true, detail: 'Records sealed; unlocked now. Sample data PIN: 2468.' })
  })

  it('on the laptop: the four sample barangays, the phone, the AI and the camera', () => {
    const allGood = laptopChecks({
      sampleBarangays: { expected: 4, paired: 4, received: 4 },
      phonesPaired: ['SID-MAL'],
      aiCached: true,
      camera: 'granted',
    })
    expect(allGood.every((check) => check.ok)).toBe(true)
    const fresh = laptopChecks({ sampleBarangays: { expected: 4, paired: 4, received: 3 }, phonesPaired: [], aiCached: false, camera: 'prompt' })
    expect(fresh.map((check) => check.ok)).toEqual([false, false, false, false])
    expect(fresh[0].fix).toEqual({ kind: 'reset' })
  })
})

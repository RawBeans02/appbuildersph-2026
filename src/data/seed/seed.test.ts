import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentFlood, groupHouseholds, markHouseholdExposed } from '../../features/flood/flood'
import { saveStockLot, UNITS, validateDraft } from '../../features/stock/stock'
import { KNOWN_DRUGS } from '../../rules/label'
import { lotStatus, reviewExposureStock, summarizeDoxycycline } from '../../rules/stock'
import { watchedCount, watchList } from '../../rules/watch'
import { openAppDb } from '../db/appDb'
import type { ExposureKind, HingaOutcome, SeedData, StockLot } from '../db/types'
import { DEMO_SCAN_LABEL } from './demoLabel'
import { generateSeed } from './generate'

// Fri Oct 9 2026, 9:30 in the morning, local time.
const TODAY = new Date(2026, 9, 9, 9, 30)
const seed = generateSeed(TODAY)
const FLOODED_PUROKS = ['Purok 1', 'Purok 2', 'Purok 3']

// Calendar helpers written apart from the generator's, so the tests check it.
const dayIndex = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000
const daysFrom = (from: string, to: string) => dayIndex(to) - dayIndex(from)
const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function wholeMonths(birthDate: string, on: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [oy, om, od] = on.split('-').map(Number)
  return (oy - by) * 12 + (om - bm) - (od < bd ? 1 : 0)
}

function wholeYears(birthDate: string, on: string): number {
  return Math.floor(wholeMonths(birthDate, on) / 12)
}

// The age bands the seed promises to cover; the first three are Hinga's.
function ageBand(birthDate: string, on: string): string {
  const months = wholeMonths(birthDate, on)
  if (months < 2) return 'under 2 months'
  if (months < 12) return '2–12 months'
  if (months < 60) return '1–5 years'
  const y = wholeYears(birthDate, on)
  if (y < 18) return '5–17 years'
  if (y < 60) return '18–59 years'
  return '60+ years'
}

// Leptospirosis watch window: day 5 to 15 after the day of exposure.
const inWatchWindow = (exposedOn: string, today: string) => {
  const day = daysFrom(exposedOn, today)
  return day >= 5 && day <= 15
}

// WHO IMCI 2014 fast-breathing cut-offs, breaths per minute.
const fastBreathingCutoff = (ageMonths: number) => (ageMonths < 2 ? 60 : ageMonths < 12 ? 50 : 40)

// Seeded lots as the loader stores them.
const storedLots = (data: SeedData): StockLot[] => (data.stockLots ?? []).map((lot) => ({ ...lot, sample: true }))

// The scanned box, as the stock screen saves it once confirmed.
const scannedLot: StockLot = {
  id: 'scanned',
  ...DEMO_SCAN_LABEL,
  source: 'ocr',
  ocrConfidence: { drug: 0.9, lot: 0.9, expiry: 0.9 },
  confirmedAt: '2026-10-09T02:00:00.000Z',
  sample: false,
}

// Doxycycline counts by A5's rules (src/rules/stock.ts).
function doxycyclineCounts(lots: StockLot[], today: string) {
  const { capsulesOnHand, capsulesExpiringSoon, capsulesExpired } = summarizeDoxycycline(lots, today)
  return { capsulesOnHand, capsulesExpiringSoon, capsulesExpired }
}

function storyCounts(data: SeedData, today: string) {
  return {
    exposedInWindow: new Set(
      (data.exposures ?? []).filter((e) => inWatchWindow(e.exposedOn, today)).map((e) => e.residentId),
    ).size,
    ...doxycyclineCounts(storedLots(data), today),
  }
}

const allRecords = (data: SeedData) => [
  ...data.residents,
  ...(data.floodEvents ?? []),
  ...(data.exposures ?? []),
  ...(data.hingaChecks ?? []),
  ...(data.stockLots ?? []),
]

describe('generateSeed is deterministic', () => {
  it('gives the same seed for the same day, whatever the time of day', () => {
    const early = generateSeed(new Date(2026, 9, 9, 0, 1))
    const late = generateSeed(new Date(2026, 9, 9, 23, 59))
    expect(early).toEqual(seed)
    expect(late).toEqual(seed)
  })

  it('never calls Math.random', () => {
    const random = vi.spyOn(Math, 'random')
    generateSeed(TODAY)
    expect(random).not.toHaveBeenCalled()
    random.mockRestore()
  })

  it('counts every date from today, so another day shifts the dates, not the story', () => {
    const later = generateSeed(new Date(2027, 0, 3, 9, 30))
    const ages = (data: SeedData, today: string) => data.residents.map((r) => daysFrom(r.birthDate, today))
    expect(ages(later, '2027-01-03')).toEqual(ages(seed, '2026-10-09'))
    expect(later.floodEvents?.[0].startedOn).toBe('2026-12-28')
    expect(later.exposures?.map((e) => e.exposedOn)).toEqual(Array(9).fill('2026-12-28'))
    expect(later.residents.map((r) => r.name)).toEqual(seed.residents.map((r) => r.name))
  })
})

describe('the demo story', () => {
  it.each([
    ['a mid-month day', new Date(2026, 9, 9, 9, 30)],
    ['the turn of the year', new Date(2026, 11, 30, 21, 0)],
    ['the end of February', new Date(2027, 1, 28, 6, 0)],
    ['a leap day', new Date(2028, 1, 29, 12, 0)],
  ])('holds on %s: 9 exposed in the watch window, 10 doxycycline capsules, none expiring soon', (_, today) => {
    const data = generateSeed(today)
    expect(storyCounts(data, localDay(today))).toEqual({
      exposedInWindow: 9,
      capsulesOnHand: 10,
      capsulesExpiringSoon: 0,
      capsulesExpired: 0,
    })
    // No seeded lot of anything is expiring or expired: only the scanned box is.
    for (const lot of data.stockLots ?? []) expect(lotStatus(lot.expiry, localDay(today))).toBe('ok')
  })

  it('names residents only "Residente 001", "Residente 002", …', () => {
    expect(seed.residents.length).toBe(60)
    for (const resident of seed.residents) expect(resident.name).toMatch(/^Residente \d{3}$/)
    expect(seed.residents.map((r) => r.name)).toEqual(
      Array.from({ length: 60 }, (_, i) => `Residente ${String(i + 1).padStart(3, '0')}`),
    )
  })

  it('places them in 16 households across Purok 1 to 5', () => {
    const households = new Map<string, Set<string>>()
    for (const r of seed.residents) {
      households.set(r.householdId, (households.get(r.householdId) ?? new Set()).add(r.purok))
    }
    expect(households.size).toBe(16)
    // A household lives in one purok.
    for (const puroks of households.values()) expect(puroks.size).toBe(1)
    expect(new Set(seed.residents.map((r) => r.purok))).toEqual(
      new Set(['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5']),
    )
  })

  it('covers every age band, with Hinga-age children in each of its three bands', () => {
    const bands = new Map<string, number>()
    for (const r of seed.residents) {
      const band = ageBand(r.birthDate, '2026-10-09')
      bands.set(band, (bands.get(band) ?? 0) + 1)
    }
    expect(Object.fromEntries(bands)).toEqual({
      'under 2 months': 2,
      '2–12 months': 2,
      '1–5 years': 4,
      '5–17 years': 18,
      '18–59 years': 25,
      '60+ years': 9,
    })
  })

  it('has one active flood event that started 6 days ago', () => {
    expect(seed.floodEvents).toHaveLength(1)
    expect(seed.floodEvents?.[0]).toMatchObject({ startedOn: '2026-10-03', endedOn: null })
  })

  it('exposes 9 different residents on the flood day, with every kind of exposure', () => {
    const exposures = seed.exposures ?? []
    expect(exposures).toHaveLength(9)
    expect(new Set(exposures.map((e) => e.residentId)).size).toBe(9)
    expect(exposures.every((e) => e.exposedOn === '2026-10-03')).toBe(true)
    const kinds = new Set(exposures.flatMap((e) => e.kinds))
    expect(kinds).toEqual(new Set<ExposureKind>(['waded', 'open-wound', 'repeated']))
  })

  it('exposes whole households, as the watch screen marks them, all in the flooded puroks', () => {
    const exposed = new Set((seed.exposures ?? []).map((e) => e.residentId))
    const exposedResidents = seed.residents.filter((r) => exposed.has(r.id))
    const households = new Set(exposedResidents.map((r) => r.householdId))
    expect(households.size).toBe(3)
    for (const r of seed.residents) expect(exposed.has(r.id)).toBe(households.has(r.householdId))
    for (const r of exposedResidents) expect(FLOODED_PUROKS).toContain(r.purok)
  })

  it('puts all 9 on the app’s watch list, inside the window today', () => {
    const exposures = (seed.exposures ?? []).map((e) => ({ ...e, sample: true }))
    const entries = watchList(exposures, '2026-10-09')
    expect(entries).toHaveLength(9)
    expect(entries.every((entry) => entry.phase === 'active')).toBe(true)
    expect(watchedCount(entries)).toBe(9)
  })

  it('reaches 12 exposed when the presenter taps the three one-person households on the watch screen', async () => {
    const db = await openAppDb('seed-demo-taps', async () => seed)
    const residents = await db.residents.list({ limit: 1000 })
    const exposed = new Set((await db.exposures.list({ limit: 1000 })).map((e) => e.residentId))
    const toTap = groupHouseholds(residents).filter(
      (h) => FLOODED_PUROKS.includes(h.purok) && h.members.length === 1 && !exposed.has(h.members[0].id),
    )
    expect(toTap.map((h) => h.id)).toEqual(['HH-03', 'HH-07', 'HH-10'])

    const flood = currentFlood(await db.floodEvents.list())!
    for (const household of toTap) {
      await markHouseholdExposed(db, { floodEventId: flood.id, household, exposedOn: '2026-10-09', kinds: ['waded'] }, TODAY)
    }
    expect(watchedCount(watchList(await db.exposures.list({ limit: 1000 }), '2026-10-09'))).toBe(12)
    db.close()
  })

  it('stocks doxycycline 100 mg in DEMO-LOT-25B only (10, 9 months out), plus other station stock', () => {
    const doxycycline = (seed.stockLots ?? []).filter((lot) => lot.drug === 'Doxycycline')
    expect(doxycycline.map(({ lot, strength, quantity, unit, expiry }) => ({ lot, strength, quantity, unit, expiry })))
      .toEqual([{ lot: 'DEMO-LOT-25B', strength: '100 mg', quantity: 10, unit: 'capsule', expiry: '2027-07' }])
    // The presenter scans DEMO-LOT-24A live, so it isn't seeded.
    expect((seed.stockLots ?? []).map((lot) => lot.lot)).not.toContain(DEMO_SCAN_LABEL.lot)
    expect((seed.stockLots ?? []).filter((lot) => lot.drug !== 'Doxycycline').length).toBeGreaterThanOrEqual(2)
  })

  it('records stock the way the stock screen would: known drug names, its units, valid drafts', () => {
    for (const lot of seed.stockLots ?? []) {
      expect(KNOWN_DRUGS).toContain(lot.drug)
      expect(UNITS).toContain(lot.unit)
      const { drug, strength, lot: lotNumber, expiry, quantity, unit } = lot
      expect(validateDraft({ drug, strength, lot: lotNumber, expiry, quantity, unit })).toEqual([])
    }
  })

  it('keeps 3 past Hinga checks (fast and not fast) that agree with the WHO IMCI cut-offs', () => {
    const checks = seed.hingaChecks ?? []
    expect(checks).toHaveLength(3)
    expect(new Set(checks.map((c) => c.outcome))).toEqual(new Set<HingaOutcome>(['fast', 'not-fast']))
    for (const check of checks) {
      const child = seed.residents.find((r) => r.id === check.residentId)!
      const checkDay = localDay(new Date(check.checkedAt))
      expect(check.ageMonths).toBe(wholeMonths(child.birthDate, checkDay))
      expect(check.ageMonths).toBeLessThan(60)
      expect(check.breathsPerMinute).not.toBeNull()
      const fast = check.breathsPerMinute! >= fastBreathingCutoff(check.ageMonths)
      expect(check.outcome).toBe(fast ? 'fast' : 'not-fast')
      // Plausible resting rates for a young child, not a measurement.
      expect(check.breathsPerMinute).toBeGreaterThanOrEqual(30)
      expect(check.breathsPerMinute).toBeLessThanOrEqual(60)
    }
  })
})

describe('the live stock scan (DEMO-LOT-24A)', () => {
  const DEMO_DAYS: [string, Date][] = [
    ['the video day (Oct 9)', new Date(2026, 9, 9, 9, 30)],
    ['Demo Day (Oct 10)', new Date(2026, 9, 10, 13, 0)],
  ]

  it('is a draft the stock screen accepts, for a drug the label reader knows', () => {
    expect(KNOWN_DRUGS).toContain(DEMO_SCAN_LABEL.drug)
    expect(validateDraft({ ...DEMO_SCAN_LABEL })).toEqual([])
  })

  it.each(DEMO_DAYS)('with the seed, makes 40 capsules on hand and 30 expiring soon on %s', (_, today) => {
    const day = localDay(today)
    expect(lotStatus(DEMO_SCAN_LABEL.expiry, day)).toBe('expiring')
    expect(doxycyclineCounts([...storedLots(generateSeed(today)), scannedLot], day)).toEqual({
      capsulesOnHand: 40,
      capsulesExpiringSoon: 30,
      capsulesExpired: 0,
    })
  })

  it.each(DEMO_DAYS)('runs the demo on %s: 3 household taps and the scan give 12 exposed, 40 capsules, 30 expiring, review', async (_, today) => {
    const day = localDay(today)
    const db = await openAppDb(`seed-demo-${day}`, async () => generateSeed(today))
    const households = groupHouseholds(await db.residents.list({ limit: 1000 }))
    const flood = currentFlood(await db.floodEvents.list())!
    for (const id of ['HH-03', 'HH-07', 'HH-10']) {
      const household = households.find((h) => h.id === id)!
      await markHouseholdExposed(db, { floodEventId: flood.id, household, exposedOn: day, kinds: ['waded'] }, today)
    }
    await saveStockLot(db, { ...DEMO_SCAN_LABEL }, null, today)

    const watch = watchList(await db.exposures.list({ limit: 1000 }), day)
    const review = reviewExposureStock(watch, await db.stockLots.list({ limit: 1000 }), day)
    expect(review).toMatchObject({
      exposed: 12,
      needsReview: true,
      stock: { capsulesOnHand: 40, capsulesExpiringSoon: 30, capsulesExpired: 0 },
    })
    db.close()
  })
})

describe('the seed is valid', () => {
  const isDay = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  const isMoment = (value: string) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
  const startOfToday = new Date(2026, 9, 9).getTime()

  it('gives every record a unique id, across all stores', () => {
    const ids = allRecords(seed).map((record) => record.id)
    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only refers to residents and flood events that exist', () => {
    const residents = new Set(seed.residents.map((r) => r.id))
    const floods = new Set((seed.floodEvents ?? []).map((f) => f.id))
    for (const exposure of seed.exposures ?? []) {
      expect(residents.has(exposure.residentId)).toBe(true)
      expect(floods.has(exposure.floodEventId)).toBe(true)
    }
    for (const check of seed.hingaChecks ?? []) {
      expect(check.residentId === null || residents.has(check.residentId)).toBe(true)
    }
  })

  it('leaves `sample` to the loader', () => {
    for (const record of allRecords(seed)) expect(record).not.toHaveProperty('sample')
  })

  it('matches the record types: values, formats, and nothing dated after today', () => {
    expect(seed).toMatchObject({ municipality: 'San Isidro Demo', barangay: 'Maligaya-D' })
    expect(seed.version).not.toBe('')

    for (const r of seed.residents) {
      expect(['F', 'M']).toContain(r.sex)
      expect(r.householdId).not.toBe('')
      expect(isDay(r.birthDate)).toBe(true)
      expect(r.birthDate <= '2026-10-09').toBe(true)
    }

    for (const f of seed.floodEvents ?? []) {
      expect(isDay(f.startedOn)).toBe(true)
      expect(f.endedOn === null || (isDay(f.endedOn) && f.endedOn >= f.startedOn)).toBe(true)
      expect(isMoment(f.createdAt)).toBe(true)
      expect(Date.parse(f.createdAt)).toBeLessThan(startOfToday)
    }

    const floodStart = new Map((seed.floodEvents ?? []).map((f) => [f.id, f.startedOn]))
    for (const e of seed.exposures ?? []) {
      expect(isDay(e.exposedOn)).toBe(true)
      expect(e.exposedOn >= floodStart.get(e.floodEventId)!).toBe(true)
      expect(e.exposedOn <= '2026-10-09').toBe(true)
      expect(e.kinds.length).toBeGreaterThan(0)
      expect(new Set(e.kinds).size).toBe(e.kinds.length)
      for (const kind of e.kinds) expect(['waded', 'open-wound', 'repeated']).toContain(kind)
      expect(isMoment(e.createdAt)).toBe(true)
      expect(Date.parse(e.createdAt)).toBeLessThan(startOfToday)
    }

    for (const h of seed.hingaChecks ?? []) {
      expect(['fast', 'not-fast', 'urgent', 'refused']).toContain(h.outcome)
      expect(Number.isInteger(h.ageMonths) && h.ageMonths >= 0).toBe(true)
      // A refused check has no count and says why; any other has a count.
      expect(h.breathsPerMinute === null).toBe(h.outcome === 'refused')
      expect(h.refusal === null).toBe(h.outcome !== 'refused')
      expect(Array.isArray(h.dangerSigns)).toBe(true)
      expect(isMoment(h.checkedAt)).toBe(true)
      expect(Date.parse(h.checkedAt)).toBeLessThan(startOfToday)
    }

    for (const lot of seed.stockLots ?? []) {
      expect(lot.lot).toMatch(/^DEMO-LOT-\w+$/)
      expect(lot.expiry).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/)
      expect(lot.expiry >= '2026-10').toBe(true)
      expect(Number.isInteger(lot.quantity) && lot.quantity > 0).toBe(true)
      expect(lot).toMatchObject({ source: 'manual', ocrConfidence: null })
      for (const field of [lot.drug, lot.strength, lot.unit]) expect(field).not.toBe('')
      expect(isMoment(lot.confirmedAt)).toBe(true)
      expect(Date.parse(lot.confirmedAt)).toBeLessThan(startOfToday)
    }
  })

  it('loads through the app’s first-run loader, every record marked as sample data', async () => {
    const db = await openAppDb('seed-test', async () => seed)
    expect(await db.getSeedInfo()).toMatchObject({ version: seed.version, barangay: 'Maligaya-D' })
    const stores = [
      [db.residents, seed.residents],
      [db.floodEvents, seed.floodEvents],
      [db.exposures, seed.exposures],
      [db.hingaChecks, seed.hingaChecks],
      [db.stockLots, seed.stockLots],
    ] as const
    for (const [repository, records] of stores) {
      const stored = await repository.list()
      expect(stored).toHaveLength(records?.length ?? 0)
      expect(stored.every((record) => record.sample === true)).toBe(true)
    }
    db.close()
  })
})

describe('the seed module', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  it('generates the seed for the day it is first evaluated', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 9, 7, 15))
    vi.resetModules()
    const { seed: loaded } = await import('./index')
    expect(loaded).toEqual(seed)
  })
})

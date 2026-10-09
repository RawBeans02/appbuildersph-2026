import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAppDb } from '../db/appDb'
import type { ExposureKind, HingaOutcome, SeedData } from '../db/types'
import { generateSeed } from './generate'

// Fri Oct 9 2026, 9:30 in the morning, local time.
const TODAY = new Date(2026, 9, 9, 9, 30)
const seed = generateSeed(TODAY)

// Calendar helpers written apart from the generator's, so the tests check it.
const dayIndex = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000
const daysFrom = (from: string, to: string) => dayIndex(to) - dayIndex(from)
const plusDays = (day: string, days: number) =>
  new Date((dayIndex(day) + days) * 86_400_000).toISOString().slice(0, 10)
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

// Expiry is a month (YYYY-MM). A lot expires within 6 weeks when its expiry
// month is this month or later, and no later than the month 6 weeks from today.
const expiresWithin6Weeks = (expiry: string, today: string) =>
  expiry >= today.slice(0, 7) && expiry <= plusDays(today, 42).slice(0, 7)

// WHO IMCI 2014 fast-breathing cut-offs, breaths per minute.
const fastBreathingCutoff = (ageMonths: number) => (ageMonths < 2 ? 60 : ageMonths < 12 ? 50 : 40)

function storyCounts(data: SeedData, today: string) {
  const doxycycline = (data.stockLots ?? []).filter((lot) => lot.drug === 'Doxycycline')
  return {
    exposedInWindow: new Set(
      (data.exposures ?? []).filter((e) => inWatchWindow(e.exposedOn, today)).map((e) => e.residentId),
    ).size,
    capsulesOnHand: doxycycline.reduce((sum, lot) => sum + lot.quantity, 0),
    capsulesExpiringIn6Weeks: doxycycline
      .filter((lot) => expiresWithin6Weeks(lot.expiry, today))
      .reduce((sum, lot) => sum + lot.quantity, 0),
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
  ])('holds on %s: 9 exposed in the watch window, 40 capsules, 30 expiring within 6 weeks', (_, today) => {
    expect(storyCounts(generateSeed(today), localDay(today))).toEqual({
      exposedInWindow: 9,
      capsulesOnHand: 40,
      capsulesExpiringIn6Weeks: 30,
    })
  })

  it('names residents only "Residente 001", "Residente 002", …', () => {
    expect(seed.residents.length).toBe(60)
    for (const resident of seed.residents) expect(resident.name).toMatch(/^Residente \d{3}$/)
    expect(seed.residents.map((r) => r.name)).toEqual(
      Array.from({ length: 60 }, (_, i) => `Residente ${String(i + 1).padStart(3, '0')}`),
    )
  })

  it('places them in 15 households across Purok 1 to 5', () => {
    const households = new Map<string, Set<string>>()
    for (const r of seed.residents) {
      households.set(r.householdId, (households.get(r.householdId) ?? new Set()).add(r.purok))
    }
    expect(households.size).toBe(15)
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
      '18–59 years': 26,
      '60+ years': 8,
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
    // Room for the presenter to tap 3 more residents during the demo.
    expect(seed.residents.length - exposures.length).toBeGreaterThanOrEqual(3)
  })

  it('stocks doxycycline 100 mg in DEMO-LOT-24A (30, expiring in 6 weeks) and DEMO-LOT-25B (10, 9 months out)', () => {
    const doxycycline = (seed.stockLots ?? []).filter((lot) => lot.drug === 'Doxycycline')
    expect(doxycycline.map(({ lot, strength, quantity, unit, expiry }) => ({ lot, strength, quantity, unit, expiry })))
      .toEqual([
        { lot: 'DEMO-LOT-24A', strength: '100 mg', quantity: 30, unit: 'capsules', expiry: '2026-11' },
        { lot: 'DEMO-LOT-25B', strength: '100 mg', quantity: 10, unit: 'capsules', expiry: '2027-07' },
      ])
    // Other station stock, none of it expiring within 6 weeks.
    const others = (seed.stockLots ?? []).filter((lot) => lot.drug !== 'Doxycycline')
    expect(others.length).toBeGreaterThanOrEqual(2)
    for (const lot of others) expect(expiresWithin6Weeks(lot.expiry, '2026-10-09')).toBe(false)
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

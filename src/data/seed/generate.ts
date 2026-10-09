import type { ExposureKind, SeedData } from '../db/types'

// The synthetic seed for the phone: barangay Maligaya-D in the fictional
// municipality San Isidro Demo. Everything here is invented sample data:
// residents are only ever "Residente 001"…, lots are "DEMO-LOT-…", and the
// Hinga checks are sample records, not measurements of anyone.
//
// Deterministic: one seeded PRNG (never Math.random), and every date counts
// back or forward from `today`'s local calendar day. The same day always gives
// the same seed, and the demo story stays current whenever the seed first loads:
// - 60 residents in 16 households across Purok 1–5, every age band, 8 under 5;
// - one active flood event that started 6 days ago, with 9 residents (three
//   whole households) exposed that day, inside the day 5–15 leptospirosis
//   watch window, and three one-person households left for the demo's taps;
// - doxycycline 100 mg: 10 capsules in a lot expiring 9 months out; the 30
//   expiring soon come from the box the presenter scans (./demoLabel.ts);
//   and other station stock, none of it expiring within 6 weeks;
// - 3 past Hinga checks (one fast, two not fast).

export const SEED_VERSION = 'maligaya-d-2'
export const MUNICIPALITY = 'San Isidro Demo'
export const BARANGAY = 'Maligaya-D'

type SeedResident = SeedData['residents'][number]
type SeedFloodEvent = NonNullable<SeedData['floodEvents']>[number]
type SeedExposure = NonNullable<SeedData['exposures']>[number]
type SeedHingaCheck = NonNullable<SeedData['hingaChecks']>[number]
type SeedStockLot = NonNullable<SeedData['stockLots']>[number]

// Any fixed number; changing it reshuffles sexes, birthdays and who was exposed.
const PRNG_SEED = 0x41_47_50_59

// mulberry32 (Tommy Ettinger, public domain): a tiny 32-bit PRNG, uniform in [0, 1).
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

type Rng = () => number

const randomInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1))

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Calendar days as YYYY-MM-DD. Arithmetic runs in UTC so it never meets a
// daylight-saving gap; only `today` itself is read in local time.
const pad = (n: number) => String(n).padStart(2, '0')

function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDay(day: string): [number, number, number] {
  const [year, month, date] = day.split('-').map(Number)
  return [year, month, date]
}

function addDays(day: string, days: number): string {
  const [year, month, date] = parseDay(day)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

// YYYY-MM, `months` after the month of `day`.
function addMonths(day: string, months: number): string {
  const [year, month] = parseDay(day)
  const index = year * 12 + (month - 1) + months
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

// Whole calendar months from a birth date to a day (how ages in months are counted).
function monthsOld(birthDate: string, on: string): number {
  const [by, bm, bd] = parseDay(birthDate)
  const [oy, om, od] = parseDay(on)
  return (oy - by) * 12 + (om - bm) - (od < bd ? 1 : 0)
}

// A moment on a local calendar day, as a full ISO string.
function at(day: string, hour: number, minute: number): string {
  const [year, month, date] = parseDay(day)
  return new Date(year, month - 1, date, hour, minute).toISOString()
}

// Age bands, with the range of ages (in days on `today`) drawn for each. The
// ranges stay clear of the band edges, so every birthday lands inside its band
// whatever today is. The first three are Hinga's (WHO IMCI) bands.
type Band = 'under 2 months' | '2 to 11 months' | '1 to 4 years' | '5 to 17 years' | '18 to 59 years' | '60+ years'

const years = (n: number) => Math.round(n * 365.25)

const AGE_IN_DAYS: Record<Band, readonly [min: number, max: number]> = {
  'under 2 months': [20, 50],
  '2 to 11 months': [75, 330],
  '1 to 4 years': [400, 1750],
  '5 to 17 years': [years(5.1), years(17.8)],
  '18 to 59 years': [years(18.2), years(59.8)],
  '60+ years': [years(60.2), years(84)],
}

// Who lives in each household, by age band, and in which purok. The flood
// reached Purok 1–3: everyone in the three households marked `exposed` waded
// through it on its first day (9 residents). Three one-person households there
// are not exposed yet: the presenter taps them on the watch screen (a tap marks
// a whole household), which makes 12 exposed.
type HouseholdPlan = { purok: number; members: readonly Band[]; exposed?: true }

const HOUSEHOLDS: readonly HouseholdPlan[] = [
  { purok: 1, members: ['18 to 59 years', '18 to 59 years', '5 to 17 years', '5 to 17 years'], exposed: true },
  { purok: 1, members: ['18 to 59 years', '18 to 59 years', '5 to 17 years', '5 to 17 years', '5 to 17 years', '1 to 4 years'] },
  { purok: 1, members: ['60+ years'] },
  { purok: 1, members: ['18 to 59 years', '18 to 59 years', '5 to 17 years', '5 to 17 years', 'under 2 months'] },
  { purok: 2, members: ['60+ years', '18 to 59 years', '18 to 59 years'], exposed: true },
  { purok: 2, members: ['18 to 59 years', '18 to 59 years', '2 to 11 months', '5 to 17 years'] },
  { purok: 2, members: ['60+ years'] },
  { purok: 3, members: ['18 to 59 years', '5 to 17 years'], exposed: true },
  { purok: 3, members: ['60+ years', '18 to 59 years', '18 to 59 years', '5 to 17 years', '5 to 17 years', 'under 2 months'] },
  { purok: 3, members: ['18 to 59 years'] },
  { purok: 3, members: ['18 to 59 years', '18 to 59 years', '5 to 17 years', '1 to 4 years'] },
  { purok: 4, members: ['18 to 59 years', '18 to 59 years', '5 to 17 years', '5 to 17 years', '2 to 11 months'] },
  { purok: 4, members: ['60+ years', '60+ years', '18 to 59 years'] },
  { purok: 4, members: ['18 to 59 years', '18 to 59 years', '5 to 17 years', '5 to 17 years', '1 to 4 years'] },
  { purok: 5, members: ['60+ years', '18 to 59 years', '18 to 59 years', '5 to 17 years', '5 to 17 years', '1 to 4 years'] },
  { purok: 5, members: ['60+ years', '60+ years', '18 to 59 years', '18 to 59 years'] },
]

const FLOOD_DAYS_AGO = 6

// The exposure details of the 9 exposed residents, dealt out at random.
const EXPOSURE_KINDS: readonly ExposureKind[][] = [
  ['waded'],
  ['waded'],
  ['waded'],
  ['waded'],
  ['waded', 'open-wound'],
  ['waded', 'open-wound'],
  ['waded', 'repeated'],
  ['waded', 'repeated'],
  ['waded', 'open-wound', 'repeated'],
]

export function generateSeed(today: Date): SeedData {
  const rng = mulberry32(PRNG_SEED)
  const day = localDay(today)

  const people: { resident: SeedResident; band: Band; exposed: boolean }[] = []
  HOUSEHOLDS.forEach((household, h) => {
    for (const band of household.members) {
      const number = String(people.length + 1).padStart(3, '0')
      const [min, max] = AGE_IN_DAYS[band]
      const resident: SeedResident = {
        id: `res-${number}`,
        name: `Residente ${number}`,
        householdId: `HH-${pad(h + 1)}`,
        purok: `Purok ${household.purok}`,
        sex: rng() < 0.5 ? 'F' : 'M',
        birthDate: addDays(day, -randomInt(rng, min, max)),
      }
      people.push({ resident, band, exposed: household.exposed === true })
    }
  })

  const floodDay = addDays(day, -FLOOD_DAYS_AGO)
  const flood: SeedFloodEvent = {
    id: 'flood-001',
    startedOn: floodDay,
    endedOn: null,
    note: 'Floodwater in Purok 1, 2 and 3 after the typhoon',
    createdAt: at(floodDay, 7, 30),
  }

  const kinds = shuffled(rng, EXPOSURE_KINDS)
  const exposures: SeedExposure[] = people
    .filter((p) => p.exposed)
    .map((p, i) => ({
      id: `exp-${String(i + 1).padStart(3, '0')}`,
      floodEventId: flood.id,
      residentId: p.resident.id,
      exposedOn: floodDay,
      kinds: [...kinds[i]],
      createdAt: at(floodDay, 18, 5 + i * 4),
    }))

  // Past Hinga checks in the evacuation center, after the flood. Each draws
  // its rate from a range that sits on one side of the WHO IMCI cut-off for
  // the child's age (60/min under 2 months, 50 at 2 to 11 months, 40 at 1 to 4 years).
  const childIn = (band: Band) => shuffled(rng, people.filter((p) => p.band === band))[0].resident
  const hingaPlan = [
    { child: childIn('1 to 4 years'), daysAgo: 4, time: [9, 40], rate: [43, 50], outcome: 'fast' },
    { child: childIn('2 to 11 months'), daysAgo: 3, time: [10, 15], rate: [36, 45], outcome: 'not-fast' },
    { child: childIn('under 2 months'), daysAgo: 1, time: [14, 20], rate: [42, 52], outcome: 'not-fast' },
  ] as const
  const hingaChecks: SeedHingaCheck[] = hingaPlan.map((check, i) => {
    const checkDay = addDays(day, -check.daysAgo)
    return {
      id: `hinga-${String(i + 1).padStart(3, '0')}`,
      residentId: check.child.id,
      checkedAt: at(checkDay, check.time[0], check.time[1]),
      ageMonths: monthsOld(check.child.birthDate, checkDay),
      breathsPerMinute: randomInt(rng, check.rate[0], check.rate[1]),
      outcome: check.outcome,
      refusal: null,
      dangerSigns: [],
    }
  })

  const lot = (
    n: number,
    fields: Pick<SeedStockLot, 'drug' | 'strength' | 'lot' | 'expiry' | 'quantity' | 'unit'>,
    confirmedDaysAgo: number,
  ): SeedStockLot => ({
    id: `stock-${String(n).padStart(3, '0')}`,
    ...fields,
    source: 'manual',
    ocrConfidence: null,
    confirmedAt: at(addDays(day, -confirmedDaysAgo), 9, 0),
  })
  const stockLots: SeedStockLot[] = [
    // DEMO-LOT-24A (30 capsules, EXP 11/2026) is not here: the presenter scans
    // its printed label live (./demoLabel.ts).
    lot(1, {
      drug: 'Doxycycline',
      strength: '100 mg',
      lot: 'DEMO-LOT-25B',
      expiry: addMonths(day, 9),
      quantity: 10,
      unit: 'capsule',
    }, 2),
    lot(2, {
      drug: 'Paracetamol',
      strength: '500 mg',
      lot: 'DEMO-LOT-26C',
      expiry: addMonths(day, 14),
      quantity: 200,
      unit: 'tablet',
    }, 12),
    lot(3, {
      drug: 'Amoxicillin',
      strength: '500 mg',
      lot: 'DEMO-LOT-23D',
      expiry: addMonths(day, 5),
      quantity: 100,
      unit: 'capsule',
    }, 12),
    lot(4, {
      drug: 'Oral rehydration salts',
      strength: '20.5 g',
      lot: 'DEMO-LOT-27E',
      expiry: addMonths(day, 3),
      quantity: 50,
      unit: 'sachet',
    }, 2),
  ]

  return {
    version: SEED_VERSION,
    municipality: MUNICIPALITY,
    barangay: BARANGAY,
    residents: people.map((p) => p.resident),
    floodEvents: [flood],
    exposures,
    hingaChecks,
    stockLots,
  }
}

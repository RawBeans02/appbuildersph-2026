// The records Agapay keeps on the device (IndexedDB). Synthetic data only.
// Dates are ISO strings: YYYY-MM-DD for days, full ISO for moments.
// `sample: true` marks seeded demo records, which the UI labels "Sample data".

export type Resident = {
  id: string
  // Synthetic names only, e.g. "Residente 001".
  name: string
  householdId: string
  purok: string
  sex: 'F' | 'M'
  birthDate: string
  sample: boolean
}

export type FloodEvent = {
  id: string
  startedOn: string
  endedOn: string | null
  note: string
  createdAt: string
  sample: boolean
}

export type ExposureKind = 'waded' | 'open-wound' | 'repeated'

export type Exposure = {
  id: string
  floodEventId: string
  residentId: string
  // The day of contact with floodwater; the watch window counts from it.
  exposedOn: string
  kinds: ExposureKind[]
  createdAt: string
  sample: boolean
}

export type HingaOutcome = 'fast' | 'not-fast' | 'urgent' | 'refused'

export type HingaCheck = {
  id: string
  residentId: string | null
  checkedAt: string
  ageMonths: number
  // null when the check refused to count.
  breathsPerMinute: number | null
  outcome: HingaOutcome
  // Why the check refused (motion, crying…), or null.
  refusal: string | null
  dangerSigns: string[]
  sample: boolean
}

export type StockLot = {
  id: string
  drug: string
  strength: string
  lot: string
  // YYYY-MM
  expiry: string
  quantity: number
  unit: string
  source: 'ocr' | 'manual'
  // The OCR confidence per field (0..1), when read from a box.
  ocrConfidence: { drug?: number; lot?: number; expiry?: number } | null
  confirmedAt: string
  sample: boolean
}

export type Flag = {
  id: string
  kind: 'clinician-review'
  createdAt: string
  reason: string
  // The counts behind the flag, e.g. { exposed: 12, capsules: 40 }.
  details: Record<string, number | string>
  status: 'open' | 'resolved'
  sample: boolean
}

export type Approval = {
  id: string
  approvedAt: string
  // A role, never a personal name, e.g. "Municipal health officer".
  approver: string
  planSummary: string
  note: string
  sample: boolean
}

export type SeedInfo = {
  version: string
  municipality: string
  barangay: string
  loadedAt: string
}

// The Lead's synthetic seed (src/data/seed/index.ts exports `seed: SeedData`).
// The loader sets `sample: true` on every record.
type Seeded<T> = Omit<T, 'sample'>

export type SeedData = {
  version: string
  municipality: string
  barangay: string
  residents: Seeded<Resident>[]
  floodEvents?: Seeded<FloodEvent>[]
  exposures?: Seeded<Exposure>[]
  hingaChecks?: Seeded<HingaCheck>[]
  stockLots?: Seeded<StockLot>[]
}

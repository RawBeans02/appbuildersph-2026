import type { AgapayDb } from '../../data/db/db'
import type { StockLot } from '../../data/db/types'
import { CHECK_BELOW, type LabelField, type LabelReading } from '../../rules/label'
import { lotStatus, type LotStatus } from '../../rules/stock'

// A stock lot as the health worker reviews it: prefilled from the box's OCR,
// always confirmed (and corrected) by them before it's saved.

export type StockDraft = {
  drug: string
  strength: string
  lot: string
  // YYYY-MM
  expiry: string
  quantity: number
  unit: string
}

// Stored singular; shown plural (design/COPY.md, screens 11 and 12).
export const UNITS = ['capsule', 'tablet', 'sachet', 'bottle']

const UNIT_PLURAL: Record<string, string> = {
  capsule: 'capsules',
  tablet: 'tablets',
  sachet: 'sachets',
  bottle: 'bottles',
}

// "capsules"; a unit from an older record (say "vial") still reads right.
export const unitPlural = (unit: string) => UNIT_PLURAL[unit] ?? `${unit}s`

// "1 capsule", "30 capsules": the word after a count.
export const unitWord = (unit: string, quantity: number) => (quantity === 1 ? unit : unitPlural(unit))

export function draftFromReading(reading: LabelReading): StockDraft {
  return {
    drug: reading.drug?.value ?? '',
    strength: reading.strength?.value ?? '',
    lot: reading.lot?.value ?? '',
    expiry: reading.expiry?.value ?? '',
    // OCR can't count capsules; the health worker enters the quantity.
    quantity: 0,
    unit: 'capsule',
  }
}

export const MAX_QUANTITY = 100_000

export type DraftField = 'drug' | 'lot' | 'expiry' | 'quantity' | 'unit'
export type DraftErrors = Partial<Record<DraftField, string>>

// What's missing or wrong, per field, worded as the review screen shows it.
export function draftErrors(draft: StockDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (!draft.drug.trim()) errors.drug = 'Type the medicine name.'
  if (!draft.lot.trim()) errors.lot = 'Type the lot number.'
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(draft.expiry)) errors.expiry = 'Pick the expiry month.'
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > MAX_QUANTITY) {
    errors.quantity = `Type how many ${unitPlural(draft.unit)} are in the box.`
  }
  // The unit select offers only UNITS, so the screen never shows this one.
  if (!UNITS.includes(draft.unit)) errors.unit = 'Choose a unit.'
  return errors
}

// The same messages as a list; empty when the draft is valid.
export function validateDraft(draft: StockDraft): string[] {
  return Object.values(draftErrors(draft))
}

// The box reader's tag for one field: "Sure" at or above CHECK_BELOW,
// "Please check" below it, "Not read" when the field wasn't found.
export type ReadTag = 'sure' | 'check' | 'not-read'

export function readTag(field: LabelField | null): ReadTag {
  if (!field) return 'not-read'
  return field.confidence >= CHECK_BELOW ? 'sure' : 'check'
}

// The measured reading time (11a), and, on the first read of a session, the
// time spent loading the reader before it, so neither hides in the other.
export function readTimeText(readMs: number, loadMs: number | null): string {
  const seconds = (ms: number) => (ms / 1000).toFixed(1)
  return loadMs === null
    ? `Read on this phone in ${seconds(readMs)} s.`
    : `Read on this phone in ${seconds(readMs)} s, after ${seconds(loadMs)} s getting the AI ready.`
}

// Nothing to review: no drug, lot or expiry was read (design L9c).
export const nothingRead = (reading: LabelReading) => !reading.drug && !reading.lot && !reading.expiry

// "Doxycycline 100 mg"
export const lotName = (lot: Pick<StockLot, 'drug' | 'strength'>) => `${lot.drug} ${lot.strength}`.trim()

export type ListedLot = StockLot & { status: LotStatus }

// The stock list (screen 12a): lots whose expiry month starts within 6 weeks
// get their own group at the top; the rest, expired ones included, follow.
// Both sorted by expiry, soonest first.
export function stockSections(lots: StockLot[], today: string): { expiring: ListedLot[]; rest: ListedLot[] } {
  const listed = lots
    .map((lot) => ({ ...lot, status: lotStatus(lot.expiry, today) }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry) || lotName(a).localeCompare(lotName(b)))
  return {
    expiring: listed.filter((lot) => lot.status === 'expiring'),
    rest: listed.filter((lot) => lot.status !== 'expiring'),
  }
}

const sameText = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase()

// The same lot of the same medicine, ignoring case and spaces at the ends.
export const isSameLot = (a: Pick<StockLot, 'drug' | 'lot'>, b: Pick<StockLot, 'drug' | 'lot'>) =>
  sameText(a.drug, b.drug) && sameText(a.lot, b.lot)

// Saves a confirmed draft. Scanning or typing a lot that's already recorded
// (same drug and lot number) replaces that record, so a retake of the same
// box never counts its capsules twice.
export async function saveStockLot(
  db: AgapayDb,
  draft: StockDraft,
  reading: LabelReading | null,
  now = new Date(),
): Promise<StockLot> {
  const problems = validateDraft(draft)
  if (problems.length) throw new Error(problems.join(' '))
  const existing = (await db.stockLots.list({ limit: 500 })).find((lot) => isSameLot(lot, draft))
  const lot: StockLot = {
    id: existing?.id ?? crypto.randomUUID(),
    drug: draft.drug.trim(),
    strength: draft.strength.trim(),
    lot: draft.lot.trim().toUpperCase(),
    expiry: draft.expiry,
    quantity: draft.quantity,
    unit: draft.unit,
    source: reading ? 'ocr' : 'manual',
    ocrConfidence: reading
      ? { drug: reading.drug?.confidence, lot: reading.lot?.confidence, expiry: reading.expiry?.confidence }
      : null,
    confirmedAt: now.toISOString(),
    sample: false,
  }
  await db.stockLots.put(lot)
  return lot
}

export async function removeStockLot(db: AgapayDb, id: string): Promise<void> {
  await db.stockLots.delete(id)
}

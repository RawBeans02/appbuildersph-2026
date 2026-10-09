import type { AgapayDb } from '../../data/db/db'
import type { StockLot } from '../../data/db/types'
import type { LabelReading } from '../../rules/label'

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

export const UNITS = ['capsule', 'tablet', 'bottle', 'sachet', 'vial']

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

// What's missing or wrong, as messages for the review screen; empty when valid.
export function validateDraft(draft: StockDraft): string[] {
  const problems: string[] = []
  if (!draft.drug.trim()) problems.push('Enter the medicine name.')
  if (!draft.lot.trim()) problems.push('Enter the lot number.')
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(draft.expiry)) problems.push('Enter the expiry month and year.')
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > MAX_QUANTITY) {
    problems.push('Enter how many are on hand (a whole number).')
  }
  if (!UNITS.includes(draft.unit)) problems.push('Choose a unit.')
  return problems
}

export async function saveStockLot(
  db: AgapayDb,
  draft: StockDraft,
  reading: LabelReading | null,
  now = new Date(),
): Promise<StockLot> {
  const problems = validateDraft(draft)
  if (problems.length) throw new Error(problems.join(' '))
  const lot: StockLot = {
    id: crypto.randomUUID(),
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

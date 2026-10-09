import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openAgapayDb } from '../../data/db/db'
import { parseLabel } from '../../rules/label'
import { draftFromReading, saveStockLot, validateDraft, type StockDraft } from './stock'

const reading = parseLabel([
  { text: 'DOXYCYCLINE', score: 0.97 },
  { text: '100 mg Capsule', score: 0.95 },
  { text: 'LOT: DEMO-LOT-0421', score: 0.9 },
  { text: 'EXP 03/2027', score: 0.93 },
])

const valid: StockDraft = { ...draftFromReading(reading), quantity: 40 }

describe('draftFromReading', () => {
  it('prefills what the OCR read and leaves the quantity to the health worker', () => {
    expect(draftFromReading(reading)).toEqual({
      drug: 'Doxycycline',
      strength: '100 mg',
      lot: 'DEMO-LOT-0421',
      expiry: '2027-03',
      quantity: 0,
      unit: 'capsule',
    })
  })
})

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(valid)).toEqual([])
  })

  it('asks for every missing or impossible field', () => {
    expect(validateDraft({ drug: ' ', strength: '', lot: '', expiry: '2027-13', quantity: 1.5, unit: 'box' })).toHaveLength(5)
    expect(validateDraft({ ...valid, quantity: 0 })).toEqual(['Enter how many are on hand (a whole number).'])
  })
})

describe('saveStockLot', () => {
  it('saves a confirmed OCR lot with its field confidences', async () => {
    const db = await openAgapayDb('stock-test-1')
    const saved = await saveStockLot(db, { ...valid, lot: ' demo-lot-0421 ' }, reading, new Date('2026-10-09T10:00:00Z'))
    expect(saved).toMatchObject({
      drug: 'Doxycycline',
      lot: 'DEMO-LOT-0421',
      expiry: '2027-03',
      quantity: 40,
      source: 'ocr',
      ocrConfidence: { drug: expect.closeTo(0.97, 5), lot: expect.closeTo(0.9, 5), expiry: expect.closeTo(0.93, 5) },
      confirmedAt: '2026-10-09T10:00:00.000Z',
      sample: false,
    })
    expect(await db.stockLots.get(saved.id)).toEqual(saved)
    db.close()
  })

  it('marks a lot typed in by hand as manual, and refuses an invalid one', async () => {
    const db = await openAgapayDb('stock-test-2')
    expect((await saveStockLot(db, valid, null)).source).toBe('manual')
    await expect(saveStockLot(db, { ...valid, lot: '' }, null)).rejects.toThrow('lot number')
    db.close()
  })
})

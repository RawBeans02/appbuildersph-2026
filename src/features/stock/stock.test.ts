import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openAgapayDb } from '../../data/db/db'
import type { StockLot } from '../../data/db/types'
import { CHECK_BELOW, parseLabel } from '../../rules/label'
import {
  draftErrors,
  draftFromReading,
  isSameLot,
  lotName,
  nothingRead,
  readTag,
  readTimeText,
  removeStockLot,
  saveStockLot,
  stockSections,
  unitPlural,
  unitWord,
  UNITS,
  validateDraft,
  type StockDraft,
} from './stock'

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

describe('units', () => {
  it('stores the four designed units singular and shows them plural', () => {
    expect(UNITS).toEqual(['capsule', 'tablet', 'sachet', 'bottle'])
    expect(UNITS.map(unitPlural)).toEqual(['capsules', 'tablets', 'sachets', 'bottles'])
  })

  it('says one capsule, and reads an older unit too', () => {
    expect(unitWord('capsule', 1)).toBe('capsule')
    expect(unitWord('capsule', 30)).toBe('capsules')
    expect(unitWord('vial', 2)).toBe('vials')
  })
})

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(valid)).toEqual([])
    expect(draftErrors(valid)).toEqual({})
  })

  it('asks for every missing or impossible field', () => {
    expect(validateDraft({ drug: ' ', strength: '', lot: '', expiry: '2027-13', quantity: 1.5, unit: 'box' })).toHaveLength(5)
    expect(validateDraft({ ...valid, quantity: 0 })).toEqual(['Type how many capsules are in the box.'])
  })

  it("words each field's message as the review screen shows it, with the unit", () => {
    expect(draftErrors({ drug: '', strength: '', lot: ' ', expiry: '', quantity: 0, unit: 'sachet' })).toEqual({
      drug: 'Type the medicine name.',
      lot: 'Type the lot number.',
      expiry: 'Pick the expiry month.',
      quantity: 'Type how many sachets are in the box.',
    })
    expect(draftErrors({ ...valid, quantity: Number.NaN }).quantity).toBe('Type how many capsules are in the box.')
  })
})

describe('readTag', () => {
  it('is Sure at or above CHECK_BELOW, Please check below it, Not read when missing', () => {
    expect(readTag({ value: 'X', confidence: CHECK_BELOW, line: 0 })).toBe('sure')
    expect(readTag({ value: 'X', confidence: CHECK_BELOW - 0.01, line: 0 })).toBe('check')
    expect(readTag(null)).toBe('not-read')
  })

  it("tags the demo reading's fields", () => {
    expect([reading.drug, reading.strength, reading.lot, reading.expiry].map(readTag)).toEqual(['sure', 'sure', 'sure', 'sure'])
    const weak = parseLabel([{ text: 'LOT', score: 0.9 }, { text: 'K23104', score: 0.9 }])
    expect(readTag(weak.lot)).toBe('check')
    expect(readTag(weak.drug)).toBe('not-read')
  })
})

describe('readTimeText', () => {
  it('states the measured reading time, and the reader load apart from it', () => {
    expect(readTimeText(2412, null)).toBe('Read on this phone in 2.4 s.')
    expect(readTimeText(1380, 720)).toBe('Read on this phone in 1.4 s, after 0.7 s getting the AI ready.')
  })
})

describe('nothingRead', () => {
  it('is true only when no drug, lot or expiry was read', () => {
    expect(nothingRead(parseLabel([]))).toBe(true)
    expect(nothingRead(parseLabel([{ text: '100 mg', score: 0.9 }]))).toBe(true)
    expect(nothingRead(parseLabel([{ text: 'EXP 03/2027', score: 0.9 }]))).toBe(false)
    expect(nothingRead(reading)).toBe(false)
  })
})

let n = 0
const lot = (expiry: string, drug = 'Doxycycline', strength = '100 mg'): StockLot => ({
  id: `lot-${n++}`,
  drug,
  strength,
  lot: `DEMO-LOT-${n}`,
  expiry,
  quantity: 10,
  unit: 'capsule',
  source: 'ocr',
  ocrConfidence: null,
  confirmedAt: '2026-10-09T10:00:00.000Z',
  sample: false,
})

describe('stockSections', () => {
  it('puts lots expiring within 6 weeks first, then the rest (expired included), soonest first', () => {
    const lots = [lot('2027-07'), lot('2026-11', 'Doxycycline'), lot('2026-08', 'Paracetamol', '500 mg'), lot('2026-10', 'Amoxicillin')]
    const { expiring, rest } = stockSections(lots, '2026-10-10')
    expect(expiring.map((l) => [l.expiry, l.status])).toEqual([
      ['2026-10', 'expiring'],
      ['2026-11', 'expiring'],
    ])
    expect(rest.map((l) => [l.expiry, l.status])).toEqual([
      ['2026-08', 'expired'],
      ['2027-07', 'ok'],
    ])
  })

  it('names a lot by drug and strength', () => {
    expect(lotName({ drug: 'Doxycycline', strength: '100 mg' })).toBe('Doxycycline 100 mg')
    expect(lotName({ drug: 'Oral rehydration salts', strength: '' })).toBe('Oral rehydration salts')
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

  it('replaces the record when the same drug and lot are saved again, so a retake never doubles the count', async () => {
    const db = await openAgapayDb('stock-test-3')
    const first = await saveStockLot(db, { ...valid, quantity: 30 }, reading, new Date('2026-10-09T10:00:00Z'))
    const again = await saveStockLot(
      db,
      { ...valid, drug: ' doxycycline ', lot: 'demo-lot-0421 ', quantity: 25, expiry: '2027-04' },
      null,
      new Date('2026-10-10T09:00:00Z'),
    )
    expect(again.id).toBe(first.id)
    const all = await db.stockLots.list()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ quantity: 25, expiry: '2027-04', confirmedAt: '2026-10-10T09:00:00.000Z', source: 'manual' })
    db.close()
  })

  it('adds a new record for a different lot, or the same lot number of another drug', async () => {
    const db = await openAgapayDb('stock-test-4')
    await saveStockLot(db, valid, reading)
    await saveStockLot(db, { ...valid, lot: 'DEMO-LOT-0422' }, null)
    await saveStockLot(db, { ...valid, drug: 'Amoxicillin' }, null)
    expect(await db.stockLots.list()).toHaveLength(3)
    db.close()
  })
})

describe('isSameLot', () => {
  it('ignores case and spaces at the ends', () => {
    expect(isSameLot({ drug: 'Doxycycline', lot: 'DEMO-LOT-24A' }, { drug: ' doxycycline', lot: 'demo-lot-24a ' })).toBe(true)
    expect(isSameLot({ drug: 'Doxycycline', lot: 'DEMO-LOT-24A' }, { drug: 'Doxycycline', lot: 'DEMO-LOT-24B' })).toBe(false)
  })
})

describe('removeStockLot', () => {
  it('deletes one lot and keeps the others', async () => {
    const db = await openAgapayDb('stock-test-5')
    const a = await saveStockLot(db, valid, reading)
    const b = await saveStockLot(db, { ...valid, lot: 'DEMO-LOT-0422' }, null)
    await removeStockLot(db, a.id)
    expect((await db.stockLots.list()).map((l) => l.id)).toEqual([b.id])
    db.close()
  })
})

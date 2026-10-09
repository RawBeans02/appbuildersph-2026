import { describe, expect, it } from 'vitest'
import { DEMO_SCAN_LABEL } from '../data/seed/demoLabel'
import { parseExpiryDate, parseLabel, type OcrLineInput } from './label'

const lines = (...texts: (string | [string, number])[]): OcrLineInput[] =>
  texts.map((t) => (typeof t === 'string' ? { text: t, score: 0.95 } : { text: t[0], score: t[1] }))

describe('parseLabel', () => {
  it('reads a typical doxycycline box', () => {
    const reading = parseLabel(
      lines('DEMO', 'DOXYCYCLINE', '100 mg Capsule', 'Lot No.: DEMO-LOT-0421', 'Exp. Date: 03/2027', 'Mfg. Date: 03/2024'),
    )
    expect(reading.drug).toMatchObject({ value: 'Doxycycline', line: 1, confidence: expect.closeTo(0.95, 5) })
    expect(reading.strength).toMatchObject({ value: '100 mg', line: 2 })
    expect(reading.lot).toMatchObject({ value: 'DEMO-LOT-0421', line: 3 })
    expect(reading.expiry).toMatchObject({ value: '2027-03', line: 4, confidence: expect.closeTo(0.95, 5) })
  })

  it("reads the demo box's printed label as the seed expects it", () => {
    const reading = parseLabel(
      lines('DEMO · NOT A REAL MEDICINE · SAMPLE DATA', 'Doxycycline 100 mg capsules', 'LOT: DEMO-LOT-24A', 'EXP: 11/2026'),
    )
    expect(reading.drug?.value).toBe(DEMO_SCAN_LABEL.drug)
    expect(reading.strength?.value).toBe(DEMO_SCAN_LABEL.strength)
    expect(reading.lot?.value).toBe(DEMO_SCAN_LABEL.lot)
    expect(reading.expiry?.value).toBe(DEMO_SCAN_LABEL.expiry)
  })

  it('reads the synthetic test label', () => {
    const reading = parseLabel(lines('PARACETAMOL 500 mg', 'LOT: A23B456', 'EXP: 06/2027', 'MFG: 01/2025'))
    expect(reading).toMatchObject({
      drug: { value: 'Paracetamol' },
      strength: { value: '500 mg' },
      lot: { value: 'A23B456' },
      expiry: { value: '2027-06' },
    })
  })

  it('finds lot and expiry printed on the line under their keyword, with less confidence', () => {
    const reading = parseLabel(lines('LOT', 'K23104', 'EXP', 'JUN 2027'))
    expect(reading.lot).toMatchObject({ value: 'K23104', line: 1, confidence: expect.closeTo(0.76, 5) })
    expect(reading.expiry).toMatchObject({ value: '2027-06', line: 3 })
  })

  it('accepts Batch and B.No for the lot, and needs a digit in it', () => {
    expect(parseLabel(lines('Batch No. 23k104')).lot?.value).toBe('23K104')
    expect(parseLabel(lines('B.No: X9981')).lot?.value).toBe('X9981')
    expect(parseLabel(lines('LOT NUMBER', 'SEE SIDE')).lot).toBeNull()
  })

  it('never takes the manufacturing date as the expiry', () => {
    expect(parseLabel(lines('MFG 01/2025', 'EXP 01/2028')).expiry?.value).toBe('2028-01')
    expect(parseLabel(lines('Mfg. Date: 01/2025')).expiry).toBeNull()
  })

  it('guesses the latest date with low confidence when no expiry keyword was read', () => {
    const reading = parseLabel(lines('DOXYCYCLINE 100MG', '06/2027', '01/2025'))
    expect(reading.expiry).toMatchObject({ value: '2027-06', confidence: expect.closeTo(0.475, 5) })
  })

  it('matches a misread drug name, with lower confidence', () => {
    const reading = parseLabel(lines(['DOXYCYCLlNE', 0.9]))
    expect(reading.drug?.value).toBe('Doxycycline')
    expect(reading.drug!.confidence).toBeLessThan(0.9)
    expect(parseLabel(lines('VITAMIN WATER')).drug).toBeNull()
  })

  it('reads a syrup strength', () => {
    expect(parseLabel(lines('Amoxicillin 250 mg / 5 mL')).strength?.value).toBe('250 mg/5 mL')
  })

  it('returns nulls for an empty reading', () => {
    expect(parseLabel([])).toEqual({ drug: null, strength: null, lot: null, expiry: null })
  })
})

describe('parseExpiryDate', () => {
  it.each([
    ['06/2027', '2027-06', 1],
    ['6-2027', '2027-06', 1],
    ['06.2027', '2027-06', 1],
    ['2027-06', '2027-06', 1],
    ['JUN 2027', '2027-06', 1],
    ['Jun. 2027', '2027-06', 1],
    ['JUNE-27', '2027-06', 1],
    ['06/27', '2027-06', 0.85],
    ['30/06/2027', '2027-06', 0.7],
    ['O6/2O27', '2027-06', 1],
  ])('%s', (text, value, certainty) => {
    expect(parseExpiryDate(text)).toEqual({ value, certainty })
  })

  it('rejects impossible months', () => {
    expect(parseExpiryDate('13/2027')).toBeNull()
    expect(parseExpiryDate('no date')).toBeNull()
  })
})

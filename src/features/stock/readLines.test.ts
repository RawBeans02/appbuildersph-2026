import { describe, expect, it } from 'vitest'
import { CHECK_BELOW, type LabelReading } from '../../rules/label'
import {
  boxDelay,
  fieldLines,
  fieldNumber,
  lineMarks,
  linesFoundText,
  photoAlt,
  READ_FIELDS,
  readLinesStatus,
  tagDelay,
  tagText,
} from './readLines'

const sure = (value: string, line: number) => ({ value, confidence: 0.95, line })
const weak = (value: string, line: number) => ({ value, confidence: CHECK_BELOW - 0.1, line })

describe('the numbered lines (11b)', () => {
  it('numbers the fields 1 Medicine, 2 Strength, 3 Lot, 4 Expiry', () => {
    expect(READ_FIELDS).toEqual(['drug', 'strength', 'lot', 'expiry'])
    expect(READ_FIELDS.map((field) => fieldNumber(field))).toEqual([1, 2, 3, 4])
  })

  it('links each read field to the line it came from', () => {
    const reading: LabelReading = {
      drug: sure('Doxycycline', 0),
      strength: sure('100 mg', 1),
      lot: sure('DEMO-LOT-24A', 3),
      expiry: weak('2027-03', 4),
    }
    expect(fieldLines(reading, 6)).toEqual({ drug: 0, strength: 1, lot: 3, expiry: 4 })
    expect(lineMarks(reading, 6)).toEqual(
      new Map([
        [0, { fields: ['drug'], check: false }],
        [1, { fields: ['strength'], check: false }],
        [3, { fields: ['lot'], check: false }],
        [4, { fields: ['expiry'], check: true }],
      ]),
    )
  })

  it('gives two fields from one line one box and one tag with both numbers', () => {
    const reading: LabelReading = {
      drug: sure('Doxycycline', 0),
      strength: null,
      lot: sure('DEMO-LOT-24A', 2),
      expiry: sure('2027-03', 2),
    }
    const marks = lineMarks(reading, 3)
    expect(marks.get(2)).toEqual({ fields: ['lot', 'expiry'], check: false })
    expect(tagText(marks.get(2)!.fields)).toBe('3·4')
    expect(tagText(marks.get(0)!.fields)).toBe('1')
  })

  it('draws a shared line dashed when one of its fields needs checking', () => {
    const reading: LabelReading = { drug: null, strength: null, lot: sure('A1', 1), expiry: weak('2027-03', 1) }
    expect(lineMarks(reading, 2).get(1)?.check).toBe(true)
  })

  it('marks nothing for a field that was not read, or a line with no box', () => {
    const reading: LabelReading = { drug: sure('Doxycycline', 0), strength: null, lot: sure('A1', 5), expiry: null }
    expect(fieldLines(reading, 2)).toEqual({ drug: 0 })
    expect([...lineMarks(reading, 2).keys()]).toEqual([0])
  })
})

describe('the box motion', () => {
  it('staggers the boxes in reading order, then stamps the tags once the last box is in', () => {
    expect(boxDelay(0, 12)).toBe('calc(0 * min(var(--stagger), (var(--dur-draw) - 2 * var(--dur-quick)) / 11))')
    expect(boxDelay(3, 12)).toBe('calc(3 * min(var(--stagger), (var(--dur-draw) - 2 * var(--dur-quick)) / 11))')
    expect(tagDelay(12)).toBe(
      'calc(11 * min(var(--stagger), (var(--dur-draw) - 2 * var(--dur-quick)) / 11) + var(--dur-quick))',
    )
  })

  it('never divides by zero for a single line', () => {
    expect(boxDelay(0, 1)).toContain('/ 1)')
    expect(tagDelay(1)).toBe('calc(0 * min(var(--stagger), (var(--dur-draw) - 2 * var(--dur-quick)) / 1) + var(--dur-quick))')
  })
})

describe('the words', () => {
  it('counts the lines found', () => {
    expect(linesFoundText(12)).toBe(
      '12 lines found. Each box is a line the phone read. The numbers match the fields below.',
    )
    expect(photoAlt(12)).toBe('The box you photographed, with the 12 lines the reader found outlined.')
    expect(readLinesStatus(12)).toBe('Read 12 lines on this phone. Check the numbered fields.')
  })

  it('uses the singular for one line', () => {
    expect(linesFoundText(1)).toBe('1 line found. The box is the line the phone read. The number matches the field below.')
    expect(photoAlt(1)).toBe('The box you photographed, with the 1 line the reader found outlined.')
    expect(readLinesStatus(1)).toBe('Read 1 line on this phone. Check the numbered fields.')
  })
})

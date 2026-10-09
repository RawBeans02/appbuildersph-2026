import type { LabelReading } from '../../rules/label'
import { readTag } from './stock'

// Screen 11b: the box reader's lines, drawn on the photo. Every line it found
// is a box; a line that filled a field carries that field's number, and the
// same number sits before the field's label. Drawn only from what the reader
// returned.

// The fields the reader fills, numbered in this order: 1 Medicine,
// 2 Strength, 3 Lot, 4 Expiry.
export const READ_FIELDS = ['drug', 'strength', 'lot', 'expiry'] as const
export type ReadField = (typeof READ_FIELDS)[number]

export const fieldNumber = (field: ReadField) => READ_FIELDS.indexOf(field) + 1

// The line each field was read from. A field that wasn't read, or whose line
// has no box, has none.
export function fieldLines(reading: LabelReading, lineCount: number): Partial<Record<ReadField, number>> {
  const lines: Partial<Record<ReadField, number>> = {}
  for (const field of READ_FIELDS) {
    const line = reading[field]?.line
    if (line !== undefined && Number.isInteger(line) && line >= 0 && line < lineCount) lines[field] = line
  }
  return lines
}

export type LineMark = {
  // The fields this line filled, in field order: two fields from one line
  // share its box and its tag.
  fields: ReadField[]
  // One of them was read with low confidence ("Please check"): drawn dashed.
  check: boolean
}

// The lines that filled a field, by line index.
export function lineMarks(reading: LabelReading, lineCount: number): Map<number, LineMark> {
  const lines = fieldLines(reading, lineCount)
  const marks = new Map<number, LineMark>()
  for (const field of READ_FIELDS) {
    const line = lines[field]
    if (line === undefined) continue
    const mark = marks.get(line) ?? { fields: [], check: false }
    mark.fields.push(field)
    mark.check ||= readTag(reading[field]) === 'check'
    marks.set(line, mark)
  }
  return marks
}

// "3" or, for a line that filled two fields, "3·4".
export const tagText = (fields: readonly ReadField[]) => fields.map(fieldNumber).join('·')

// Motion (A4): the boxes `reveal` in reading order, then the tags `stamp`,
// all within --dur-draw. Both last --dur-quick; the gap between boxes is
// --stagger, shrunk when there are many lines.
const step = (count: number) =>
  `min(var(--stagger), (var(--dur-draw) - 2 * var(--dur-quick)) / ${Math.max(count - 1, 1)})`

export const boxDelay = (index: number, count: number) => `calc(${index} * ${step(count)})`

// When the last box has appeared.
export const tagDelay = (count: number) => `calc(${Math.max(count - 1, 0)} * ${step(count)} + var(--dur-quick))`

// The words (design pass 2, 11b), singular for one line.
const linesText = (count: number) => (count === 1 ? '1 line' : `${count} lines`)

export const linesFoundText = (count: number) =>
  count === 1
    ? '1 line found. The box is the line the phone read. The numbers match the fields below.'
    : `${count} lines found. Each box is a line the phone read. The numbers match the fields below.`

export const photoAlt = (count: number) =>
  `The box you photographed, with the ${linesText(count)} the reader found outlined.`

export const readLinesStatus = (count: number) => `Read ${linesText(count)} on this phone. Check the numbered fields.`

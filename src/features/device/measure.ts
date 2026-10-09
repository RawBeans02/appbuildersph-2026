// Measurements taken on this device by /device's "Measure this device", and
// the table row they're copied as (docs/MEASUREMENTS.md has the method).

export type Measurements = {
  deviceName: string
  userAgent: string
  backend: string
  ocrEngine: string
  // null: the reader was already loaded on this page, so no cold load measured.
  ocrLoadMs: number | null
  ocrFirstReadMs: number | null
  // The median of the reads after the first.
  ocrWarmReadMs: number | null
  // Whether the reads found the demo label's lot and expiry.
  ocrReadCorrect: boolean | null
  poseColdMs: number | null
  poseWarmMs: number | null
  poseWhere: string | null
  poseFps: number | null
  poseInferMedianMs: number | null
  cryStartMs: number | null
  // One PBKDF2 run that derives the PIN key (phase 2's lock).
  pinKeyMs: number | null
}

export const EMPTY_MEASUREMENTS: Omit<Measurements, 'deviceName' | 'userAgent' | 'backend' | 'ocrEngine'> = {
  ocrLoadMs: null,
  ocrFirstReadMs: null,
  ocrWarmReadMs: null,
  ocrReadCorrect: null,
  poseColdMs: null,
  poseWarmMs: null,
  poseWhere: null,
  poseFps: null,
  poseInferMedianMs: null,
  cryStartMs: null,
  pinKeyMs: null,
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const ms = (value: number | null) => (value === null ? '–' : String(Math.round(value)))

export const TABLE_HEADER = [
  '| Date | Device | Browser (user agent) | Backend | OCR engine | OCR load ms | OCR first read ms | OCR warm read ms (median) | Label read right | Pose start cold ms | Pose start warm ms | Pose runs | Pose fps (10 s) | Pose infer ms (median) | Cry check start ms | PIN key ms |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
].join('\n')

// One Markdown table row, in TABLE_HEADER's order. Pipes in the text are
// escaped so a user agent can't break the table.
export function tableRow(m: Measurements, date: Date): string {
  const cell = (text: string) => text.replace(/\|/g, '\\|')
  return `| ${[
    date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    cell(m.deviceName || '(not named)'),
    cell(m.userAgent),
    cell(m.backend),
    cell(m.ocrEngine),
    m.ocrLoadMs === null ? 'already loaded' : ms(m.ocrLoadMs),
    ms(m.ocrFirstReadMs),
    ms(m.ocrWarmReadMs),
    m.ocrReadCorrect === null ? '–' : m.ocrReadCorrect ? 'yes' : 'no',
    ms(m.poseColdMs),
    ms(m.poseWarmMs),
    cell(m.poseWhere ?? '–'),
    m.poseFps === null ? '–' : m.poseFps.toFixed(1),
    ms(m.poseInferMedianMs),
    ms(m.cryStartMs),
    ms(m.pinKeyMs),
  ].join(' | ')} |`
}

import { flattenCounts, unflattenCounts, COUNT_FIELDS, type Counts, type CountsOf, type QrPayloadV1 } from './schema.js'
import { sumCounts, type Count, type CountRange } from './suppress.js'

// Merges the verified payloads of one municipality and one ISO week into a row
// per barangay plus municipal totals. Rows keep the counts as sent ("<5"
// stays "<5"); totals are ranges, exact only when no "<5" went into them.

export type BarangayRow = {
  barangay: string
  seq: number
  counts: Counts
}

// A barangay that sent more than once: the highest seq is kept.
export type DuplicateReport = {
  barangay: string
  keptSeq: number
  // The seqs not used, in the order they were given.
  droppedSeqs: number[]
}

export type MergeErrorCode = 'empty' | 'mixed-epi-weeks' | 'mixed-municipalities'

export type MergeResult =
  | {
      ok: true
      municipality: string
      epiWeek: string
      // Sorted by barangay code.
      rows: BarangayRow[]
      totals: CountsOf<CountRange>
      duplicates: DuplicateReport[]
    }
  | { ok: false; code: MergeErrorCode; message: string }

// Payloads must come from decodeQr (verified). For a barangay that appears
// more than once, the highest seq wins; on a tie (the same QR scanned twice)
// the later one in the list is kept.
export function mergePayloads(payloads: readonly QrPayloadV1[]): MergeResult {
  if (payloads.length === 0) return { ok: false, code: 'empty', message: 'No QR codes to merge.' }
  const { municipality, epiWeek } = payloads[0]
  const weeks = new Set(payloads.map((payload) => payload.epiWeek))
  if (weeks.size > 1) {
    return { ok: false, code: 'mixed-epi-weeks', message: `The QR codes are from different weeks: ${[...weeks].sort().join(', ')}.` }
  }
  const municipalities = new Set(payloads.map((payload) => payload.municipality))
  if (municipalities.size > 1) {
    return {
      ok: false,
      code: 'mixed-municipalities',
      message: `The QR codes are from different municipalities: ${[...municipalities].sort().join(', ')}.`,
    }
  }

  const byBarangay = new Map<string, QrPayloadV1[]>()
  for (const payload of payloads) {
    byBarangay.set(payload.barangay, [...(byBarangay.get(payload.barangay) ?? []), payload])
  }

  const rows: BarangayRow[] = []
  const duplicates: DuplicateReport[] = []
  for (const [barangay, sent] of [...byBarangay].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const keptIndex = sent.reduce((newest, payload, i) => (payload.seq >= sent[newest].seq ? i : newest), 0)
    const kept = sent[keptIndex]
    rows.push({ barangay, seq: kept.seq, counts: kept.counts })
    if (sent.length > 1) {
      duplicates.push({
        barangay,
        keptSeq: kept.seq,
        droppedSeqs: sent.filter((_, i) => i !== keptIndex).map((payload) => payload.seq),
      })
    }
  }

  const columns: Count[][] = Array.from({ length: COUNT_FIELDS }, () => [])
  for (const row of rows) flattenCounts(row.counts).forEach((count, i) => columns[i].push(count))
  const totals = unflattenCounts(columns.map(sumCounts))

  return { ok: true, municipality, epiWeek, rows, totals, duplicates }
}

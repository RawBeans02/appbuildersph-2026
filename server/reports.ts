import { mergePayloads, validatePayload, type QrPayloadV1 } from '../src/qr/index.js'
import type { ReportRow, ReportsResponse } from './protocol.js'
import type { Store } from './store.js'

// GET /api/reports: the newest week's report for each barangay of one
// municipality, with when and from which laptop it arrived, plus totals for
// the newest week as ranges. Every stored payload is validated again with
// src/qr before it's returned, and only its suppressed counts go out.

export const MAX_REPORT_ROWS = 500

export async function readReports(store: Store, municipality: string): Promise<ReportsResponse> {
  const records = await store.latestReports(municipality, MAX_REPORT_ROWS)
  const rows: ReportRow[] = []
  const payloads: QrPayloadV1[] = []
  for (const record of records) {
    const checked = validatePayload(record.payload)
    if (!checked.ok) continue
    const payload = checked.value
    const matches =
      payload.municipality === municipality &&
      payload.barangay === record.barangay &&
      payload.epiWeek === record.epiWeek &&
      payload.seq === record.seq
    if (!matches) continue
    payloads.push(payload)
    rows.push({
      barangay: payload.barangay,
      epiWeek: payload.epiWeek,
      seq: payload.seq,
      counts: payload.counts,
      receivedAt: record.receivedAt.toISOString(),
      receivedFrom: record.receivedFrom,
      phoneFingerprint: record.phoneFingerprint,
    })
  }

  const newest = rows.reduce((week, row) => (row.epiWeek > week ? row.epiWeek : week), '')
  const merged = mergePayloads(payloads.filter((payload) => payload.epiWeek === newest))
  return {
    ok: true,
    municipality,
    rows,
    totals: merged.ok ? { epiWeek: merged.epiWeek, barangays: merged.rows.length, counts: merged.totals } : null,
  }
}

import { toPublicJwk } from '../../../qr'
import { MAX_SYNC_KEYS, MAX_SYNC_REPORTS, type KeyResult, type ReportResult, type SyncData, type SyncResponse } from '../../../../server/protocol'
import { barangayCodes, nameOf } from '../counts'
import type { Handoff } from '../municipal'
import { compareExports } from '../scan/classify'

// What a sync sends, built from what this laptop already holds, and what the
// server's per-item answers mean for each barangay. Pure, so it's tested
// without a server.

// One QR sent, in the order sent (the server answers by index).
export type SentReport = { barangay: string; epiWeek: string; seq: number }

export function buildSyncData(handoff: Handoff): { data: SyncData; sent: SentReport[] } {
  const barangayKeys = [...handoff.devices]
    .sort((a, b) => (a.barangay < b.barangay ? -1 : 1))
    .flatMap((device) => {
      const publicJwk = toPublicJwk(device.publicJwk)
      return publicJwk ? [{ barangay: device.barangay, publicJwk }] : []
    })
    .slice(0, MAX_SYNC_KEYS)
  // Newest first, so the limit (far above a municipality's needs) drops the oldest.
  const received = [...handoff.received].sort((a, b) => compareExports(b, a)).slice(0, MAX_SYNC_REPORTS)
  return {
    data: { barangayKeys, reports: received.map((item) => item.text.trim()) },
    sent: received.map(({ barangay, epiWeek, seq }) => ({ barangay, epiWeek, seq })),
  }
}

export type SyncTone = 'ok' | 'bad'

// One barangay's line in "Last synced": its phone key and its report.
export type SyncRow = { barangay: string; name: string; key: string; report: string; tone: SyncTone }

function keyWords(result: KeyResult | undefined): string {
  if (!result) return 'Not paired'
  if (result.ok) return result.status === 'stored' ? 'Sent' : 'Already on the server'
  return result.code === 'other-municipality' ? 'Not sent: another municipality' : 'Not sent: not a usable key'
}

function reportWords(result: ReportResult | undefined, sent: SentReport | undefined): string {
  if (!result) return 'Nothing received yet'
  if (result.ok) {
    const what = `Week ${result.epiWeek} #${result.seq}`
    if (result.status === 'stored') return `${what} uploaded`
    return result.status === 'unchanged' ? `${what} already on the server` : `${what}: the server has a newer one`
  }
  const what = sent ? `Week ${sent.epiWeek} #${sent.seq}` : 'The QR'
  switch (result.code) {
    case 'unknown-device':
      return `${what} not sent: no paired phone key`
    case 'bad-signature':
      return `${what} not sent: not signed by the paired phone`
    case 'other-municipality':
      return `${what} not sent: another municipality`
    // The server says why when the QR itself is fine: its week is in the
    // future or more than 8 weeks old.
    case 'invalid-payload':
      return result.message
        ? `${what} not sent: its week is in the future or more than 8 weeks old. Check the phone's date.`
        : `${what} not sent: not a valid barangay QR`
    default:
      return `${what} not sent: not a valid barangay QR`
  }
}

export function syncRows(sent: readonly SentReport[], response: SyncResponse): SyncRow[] {
  const keys = new Map(response.barangayKeys.map((result) => [result.barangay, result]))
  const reports = new Map<string, { result: ReportResult; sent: SentReport | undefined }>()
  for (const result of response.reports) {
    const item = sent[result.index]
    const barangay = item?.barangay ?? result.barangay
    if (!barangay) continue
    // One line per barangay: a failure outweighs an older success.
    const current = reports.get(barangay)
    if (!current || (current.result.ok && !result.ok)) reports.set(barangay, { result, sent: item })
  }
  return barangayCodes([...keys.keys(), ...reports.keys()])
    .filter((barangay) => keys.has(barangay) || reports.has(barangay))
    .map((barangay) => {
      const key = keys.get(barangay)
      const report = reports.get(barangay)
      const failed = (key && !key.ok) || (report && !report.result.ok)
      return {
        barangay,
        name: nameOf(barangay),
        key: keyWords(key),
        report: reportWords(report?.result, report?.sent),
        tone: failed ? 'bad' : 'ok',
      }
    })
}

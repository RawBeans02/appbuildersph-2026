import { decodeQr, importPublicKey, keyFingerprint, type KeyRegistry } from '../src/qr/index.js'
import type { KeyResult, ReportResult, SyncData, SyncResponse } from './protocol.js'
import type { DeviceRecord, Store } from './store.js'
import { acceptedWeeks, weekAccepted, weekRefusal } from './weeks.js'

// POST /api/sync, once the laptop is authenticated and the data's shape is
// checked: in one transaction,
// 1. store the barangay phone keys the laptop vouches for (its own
//    municipality only);
// 2. verify every counts QR again with src/qr's decodeQr against the vouched
//    keys of the municipality, refuse a week outside the accepted window
//    (weeks.ts: not in the future, not more than 8 weeks old), and store each
//    verified payload, keeping the highest seq per barangay and week;
// 3. log the sync (counts of results only) in the audit log.
// Each key and each report gets its own result; one bad item doesn't stop the
// others.

// More than any municipality has barangays; bounds the registry query.
const MAX_REGISTRY = 1000

export async function syncReports(store: Store, device: DeviceRecord, data: SyncData, now: Date): Promise<SyncResponse> {
  const ownCode = (barangay: string) => barangay.startsWith(`${device.municipality}-`)

  return store.transaction(async (tx) => {
    const barangayKeys: KeyResult[] = []
    for (const { barangay, publicJwk } of data.barangayKeys) {
      if (!ownCode(barangay)) {
        barangayKeys.push({ barangay, ok: false, code: 'other-municipality' })
        continue
      }
      // The shape was checked; this also refuses a point that isn't on the curve.
      if (!(await importPublicKey(publicJwk))) {
        barangayKeys.push({ barangay, ok: false, code: 'invalid-key' })
        continue
      }
      const status = await tx.putBarangayKey({
        barangay,
        municipality: device.municipality,
        publicJwk,
        fingerprint: await keyFingerprint(publicJwk),
        vouchedBy: device.fingerprint,
        updatedAt: now,
      })
      barangayKeys.push({ barangay, ok: true, status })
    }

    const vouched = await tx.barangayKeys(device.municipality, MAX_REGISTRY)
    const registry: KeyRegistry = Object.fromEntries(vouched.map((key) => [key.barangay, key.publicJwk]))

    const weeks = acceptedWeeks(now)
    const reports: ReportResult[] = []
    for (const [index, text] of data.reports.entries()) {
      const decoded = await decodeQr(text, registry)
      if (!decoded.ok) {
        const { barangay } = decoded
        // A QR from another municipality has no key here; say why plainly.
        const code = barangay !== undefined && !ownCode(barangay) ? 'other-municipality' : decoded.code
        reports.push(barangay === undefined ? { index, ok: false, code } : { index, ok: false, code, barangay })
        continue
      }
      const { payload } = decoded
      if (payload.municipality !== device.municipality) {
        reports.push({ index, ok: false, code: 'other-municipality', barangay: payload.barangay })
        continue
      }
      if (!weekAccepted(payload.epiWeek, weeks)) {
        reports.push({ index, ok: false, code: 'invalid-payload', barangay: payload.barangay, message: weekRefusal(weeks) })
        continue
      }
      const status = await tx.putReport({
        barangay: payload.barangay,
        epiWeek: payload.epiWeek,
        seq: payload.seq,
        municipality: payload.municipality,
        payload,
        phoneFingerprint: decoded.keyFingerprint,
        receivedFrom: device.fingerprint,
        receivedAt: now,
      })
      reports.push({ index, ok: true, barangay: payload.barangay, epiWeek: payload.epiWeek, seq: payload.seq, status })
    }

    await tx.audit({ at: now, actor: device.fingerprint, action: 'sync', detail: summary(barangayKeys, reports) })
    return { ok: true, syncedAt: now.toISOString(), barangayKeys, reports }
  })
}

// What the audit log keeps about a sync: how many of each result, no payloads.
export function summary(keys: readonly KeyResult[], reports: readonly ReportResult[]): Record<string, Record<string, number>> {
  const tally = (labels: string[]) =>
    labels.reduce<Record<string, number>>((counts, label) => ({ ...counts, [label]: (counts[label] ?? 0) + 1 }), {})
  return {
    barangayKeys: tally(keys.map((item) => (item.ok ? item.status : item.code))),
    reports: tally(reports.map((item) => (item.ok ? item.status : item.code))),
  }
}

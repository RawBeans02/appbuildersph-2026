import type { AgapayDb } from '../../data/db/db'
import { createPayload, encodePairing, encodeQr, isoWeek, type QrPayloadV1 } from '../../qr'
import { collectRawCounts } from './counts'
import { ensureDeviceIdentity, resolvePlace } from './identity'

export type ExportResult =
  | { ok: true; payload: QrPayloadV1; text: string; fingerprint: string }
  | { ok: false; reason: string }

const LIMIT = 1000

export async function readPhoneRecords(db: AgapayDb) {
  const [residents, exposures, hingaChecks, stockLots, flags] = await Promise.all([
    db.residents.list({ limit: LIMIT }),
    db.exposures.list({ limit: LIMIT }),
    db.hingaChecks.list({ limit: LIMIT }),
    db.stockLots.list({ limit: LIMIT }),
    db.flags.list({ limit: LIMIT }),
  ])
  return { residents, exposures, hingaChecks, stockLots, flags }
}

// One export: the counts as of today, signed with this phone's key, numbered
// with the next export number. Called from the user's tap.
export async function createExport(db: AgapayDb, today: string, now = new Date()): Promise<ExportResult> {
  const place = resolvePlace(await db.getSeedInfo())
  if (!place.ok) return place
  const identity = await ensureDeviceIdentity(db, place.barangay, now)
  const counts = collectRawCounts(await readPhoneRecords(db), today)
  const seq = await db.takeExportSeq()
  const [y, m, d] = today.split('-').map(Number)
  const payload = createPayload({
    municipality: place.municipality,
    barangay: place.barangay,
    epiWeek: isoWeek(new Date(y, m - 1, d)),
    seq,
    counts,
  })
  return { ok: true, payload, text: await encodeQr(payload, identity.privateKey), fingerprint: identity.fingerprint }
}

export type PairingQr = { ok: true; text: string; fingerprint: string; barangay: string } | { ok: false; reason: string }

// The one-time pairing QR: this phone's public key and codes, no signature.
// The officer checks that the laptop shows the same fingerprint before pairing.
export async function createPairingQr(db: AgapayDb, now = new Date()): Promise<PairingQr> {
  const place = resolvePlace(await db.getSeedInfo())
  if (!place.ok) return place
  const identity = await ensureDeviceIdentity(db, place.barangay, now)
  const text = encodePairing({ barangay: place.barangay, municipality: place.municipality, publicJwk: identity.publicJwk })
  return { ok: true, text, fingerprint: identity.fingerprint, barangay: place.barangay }
}

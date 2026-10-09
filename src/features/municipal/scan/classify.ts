import type { PairedDevice, ReceivedPayload } from '../../../data/db/types'
import { barangayName } from '../../../data/places'
import {
  decodePairing,
  decodeQr,
  formatCount,
  isPairingText,
  type KeyRegistry,
  type Pairing,
  type PairingErrorCode,
  type QrErrorCode,
  type QrPayloadV1,
} from '../../../qr'

// What one scanned QR means for the municipal laptop. Pure: reads the current
// pairings and received QRs, decides, and leaves the writing to the caller.

export type ScanContext = {
  // The laptop's municipality: QRs and pairings from elsewhere are refused.
  municipality: string
  devices: readonly PairedDevice[]
  received: readonly ReceivedPayload[]
}

export type ScanOutcome =
  // A verified counts QR to store; `replaces` are this barangay's older QRs.
  | { kind: 'new'; text: string; payload: QrPayloadV1; fingerprint: string; replaces: ReceivedPayload[] }
  | { kind: 'already-received'; payload: QrPayloadV1; existing: ReceivedPayload }
  // A verified QR older than one already received from the same barangay.
  | { kind: 'older'; payload: QrPayloadV1; newest: ReceivedPayload }
  // A pairing QR: the officer compares the fingerprint, then confirms.
  | { kind: 'pair'; pairing: Pairing; fingerprint: string; current: PairedDevice | null }
  | { kind: 'already-paired'; pairing: Pairing; fingerprint: string; current: PairedDevice }
  | { kind: 'other-municipality'; municipality: string; barangay: string }
  | {
      kind: 'invalid'
      source: 'counts' | 'pairing'
      code: QrErrorCode | PairingErrorCode
      detail: string
      barangay?: string
    }

export const receivedPayloadId = (payload: { barangay: string; epiWeek: string; seq: number }) =>
  `${payload.barangay}:${payload.epiWeek}:${payload.seq}`

// Positive when `a` is a later export than `b`: a later ISO week, then a higher seq.
export function compareExports(a: { epiWeek: string; seq: number }, b: { epiWeek: string; seq: number }): number {
  if (a.epiWeek !== b.epiWeek) return a.epiWeek > b.epiWeek ? 1 : -1
  return a.seq - b.seq
}

export function registryOf(devices: readonly { barangay: string; publicJwk: JsonWebKey }[]): KeyRegistry {
  return Object.fromEntries(devices.map((device) => [device.barangay, device.publicJwk]))
}

export async function classifyScan(text: string, context: ScanContext): Promise<ScanOutcome> {
  if (isPairingText(text)) {
    const result = await decodePairing(text)
    if (!result.ok) return { kind: 'invalid', source: 'pairing', code: result.code, detail: result.message }
    const { pairing, fingerprint } = result
    if (pairing.municipality !== context.municipality) {
      return { kind: 'other-municipality', municipality: pairing.municipality, barangay: pairing.barangay }
    }
    const current = context.devices.find((device) => device.barangay === pairing.barangay) ?? null
    if (current && current.fingerprint === fingerprint) return { kind: 'already-paired', pairing, fingerprint, current }
    return { kind: 'pair', pairing, fingerprint, current }
  }

  const result = await decodeQr(text, registryOf(context.devices))
  if (!result.ok) {
    return { kind: 'invalid', source: 'counts', code: result.code, detail: result.message, barangay: result.barangay }
  }
  const { payload } = result
  if (payload.municipality !== context.municipality) {
    return { kind: 'other-municipality', municipality: payload.municipality, barangay: payload.barangay }
  }
  const sameBarangay = context.received.filter((received) => received.barangay === payload.barangay)
  const existing = sameBarangay.find((received) => compareExports(received, payload) === 0)
  if (existing) return { kind: 'already-received', payload, existing }
  const newer = sameBarangay.filter((received) => compareExports(received, payload) > 0)
  if (newer.length > 0) {
    const newest = newer.reduce((a, b) => (compareExports(b, a) > 0 ? b : a))
    return { kind: 'older', payload, newest }
  }
  return { kind: 'new', text: text.trim(), payload, fingerprint: result.keyFingerprint, replaces: sameBarangay }
}

// --- What the officer reads ----------------------------------------------------

const nameOf = (code: string) => barangayName(code) ?? code
const exportOf = (item: { epiWeek: string; seq: number }) => `export ${item.seq}, week ${item.epiWeek}`

const INVALID_COUNTS: Record<QrErrorCode, (barangay: string) => string> = {
  'not-agapay': () => "This is not an Agapay QR code. Scan the QR on the barangay phone's Send screen.",
  'bad-version': () => 'This QR is from a different version of Agapay. Update the app on the phone, then send again.',
  'invalid-payload': () =>
    'This QR could not be read as Agapay counts: it is damaged or was changed. Ask the health worker to show it again.',
  'bad-signature': (barangay) =>
    `Not added: the signature does not match the phone paired for ${barangay}. The QR was changed, or it comes from another phone. If ${barangay} has a new phone, pair it first.`,
  'unknown-device': (barangay) =>
    `No phone is paired for ${barangay} yet. Scan the pairing QR on that phone's Send screen first, then its counts QR.`,
}

const INVALID_PAIRING: Record<PairingErrorCode, string> = {
  'not-pairing': 'This is not an Agapay pairing QR code.',
  'bad-version': 'This pairing QR is from a different version of Agapay. Update the app on the phone, then pair again.',
  'invalid-pairing': 'This pairing QR is damaged or was changed. Ask the health worker to show it again.',
}

// One plain sentence or two for the result panel.
export function describeOutcome(outcome: ScanOutcome): string {
  switch (outcome.kind) {
    case 'new': {
      const { payload } = outcome
      const name = nameOf(payload.barangay)
      const replaced = outcome.replaces.length > 0 ? ` It replaces ${exportOf(outcome.replaces[0])}.` : ''
      return `Received ${name}, ${exportOf(payload)}: ${formatCount(payload.counts.inWatchWindow)} in the watch window. Signature checked.${replaced}`
    }
    case 'already-received':
      return `Already received: ${nameOf(outcome.payload.barangay)}, ${exportOf(outcome.payload)}. Nothing changed.`
    case 'older':
      return `Older than the one you have: ${nameOf(outcome.payload.barangay)} ${exportOf(outcome.payload)}. Kept ${exportOf(outcome.newest)}.`
    case 'pair':
      return `Pairing QR for ${nameOf(outcome.pairing.barangay)}. Check that the phone shows the same fingerprint before you pair it.`
    case 'already-paired':
      return `${nameOf(outcome.pairing.barangay)}'s phone is already paired (fingerprint ${outcome.fingerprint}). Now scan its counts QR.`
    case 'other-municipality':
      return `This QR is for municipality ${outcome.municipality} (${outcome.barangay}). This laptop receives only its own barangays.`
    case 'invalid':
      if (outcome.source === 'pairing') return INVALID_PAIRING[outcome.code as PairingErrorCode]
      return INVALID_COUNTS[outcome.code as QrErrorCode](nameOf(outcome.barangay ?? 'this barangay'))
  }
}

import type { QrPayloadV1 } from '../../qr'

// 14d: the receipt under the QR, every value read from the export itself.
export type ExportReceipt = {
  // How many count cells the payload carries: one per age band in each banded
  // group (exposed, fastBreathing) plus one per single count. 14 in schema v1,
  // but counted from the payload, not written down.
  counts: number
  // The encoded QR text's length in bytes (UTF-8; the text is ASCII anyway).
  bytes: number
  // The export number in the payload.
  seq: number
  // This phone's key fingerprint, as the laptop shows it.
  fingerprint: string
}

export function exportReceipt(qr: { payload: QrPayloadV1; text: string; fingerprint: string }): ExportReceipt {
  const counts = Object.values(qr.payload.counts).reduce<number>(
    (sum, cell) => sum + (typeof cell === 'object' ? Object.keys(cell).length : 1),
    0,
  )
  return {
    counts,
    bytes: new TextEncoder().encode(qr.text).length,
    seq: qr.payload.seq,
    fingerprint: qr.fingerprint,
  }
}

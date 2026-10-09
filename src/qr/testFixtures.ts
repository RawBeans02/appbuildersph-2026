// Synthetic data for the qr tests only. Invented numbers, no real barangay.
import type { PayloadInput, RawCounts } from './schema'

// A large barangay a few days after a flood: several fields in the thousands,
// a few small cells to suppress.
export const SAMPLE_COUNTS: RawCounts = {
  exposed: { under2m: 3, m2to12: 27, y1to5: 118, y5to17: 642, y18to59: 1484, y60plus: 233 },
  inWatchWindow: 412,
  fastBreathing: { under2m: 0, m2to12: 2, y1to5: 14 },
  urgentReferrals: 1,
  doxyCapsulesOnHand: 1200,
  doxyCapsulesExpiring6w: 300,
  clinicianReviewFlags: 31,
}

export function sampleInput(overrides: Partial<PayloadInput> = {}): PayloadInput {
  return {
    municipality: 'SID',
    barangay: 'SID-MAL',
    epiWeek: '2026-W41',
    seq: 12,
    counts: SAMPLE_COUNTS,
    ...overrides,
  }
}

export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

import type { CheckLine } from '../../components'
import { barangayName } from '../../data/places'
import type { VerifiedReturn } from '../../qr/return'

// 21a: the checks this phone ran on a return QR that passed, in the order
// they ran (design pass 2), and the same words for the live region.
const forLine = ({ packet }: VerifiedReturn) => `For ${barangayName(packet.barangay) ?? packet.barangay}, week ${packet.epiWeek}`

export function receiveChecks(verified: VerifiedReturn): CheckLine[] {
  return [
    { status: 'ok', text: 'Read the QR' },
    { status: 'ok', text: 'Signed by the RHU laptop', detail: `Key ${verified.fingerprint}` },
    { status: 'ok', text: forLine(verified) },
  ]
}

export function receiveChecksSpoken(verified: VerifiedReturn): string {
  return `Read the QR. Signed by the RHU laptop. ${forLine(verified)}.`
}

// B31: every way receiving can fail says what happened, then one next step.
// receipt.ts, qr/return.ts and db.ts say what happened; the messages that
// stop there get their next step here. Matched by how each one starts.
const NEXT_STEPS: [start: string, next: (barangay: string | null) => string][] = [
  ['This return QR version is unsupported.', () => 'Ask the RHU to make a new return QR.'],
  ['This is not an AgapayMo return QR.', () => 'Scan the return QR on the RHU laptop.'],
  ['The return QR is too large.', () => 'Ask the RHU to make a new return QR.'],
  ['The return QR is malformed.', () => 'Scan it again, or paste the QR text.'],
  ['The municipal signature is invalid.', () => 'Ask the RHU to make a new return QR.'],
  ['These instructions are for another barangay.', (barangay) => `Ask the RHU for the QR made for ${barangay ?? 'this barangay'}.`],
  ['This approval is older than', () => 'Ask the RHU for the return QR of the newest approval.'],
  ['This approval ID already has different instructions.', () => 'Ask the RHU to make a new return QR.'],
]

export function receiveError(message: string, barangay: string | null): string {
  const found = NEXT_STEPS.find(([start]) => message.startsWith(start))
  return found ? `${message} ${found[1](barangay)}` : message
}

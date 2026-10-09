import { compareExports, type ScanOutcome } from './classify'
import { formatClock, nameOf } from '../counts'

// What one scan shows in the result panel beside the camera (screens 17g and
// 17h, on 17b–17f): a title, the checks this laptop ran in the order it ran
// them, and what to do next. The list stops at the line that failed: never a
// check for a line that didn't run. Pairing a phone is its own confirm step.

export type BannerKind = 'received' | 'already-received' | 'not-valid' | 'updated' | 'older' | 'already-paired'

// One check line (the shared CheckLines component draws it).
export type ScanCheck = { status: 'ok' | 'failed' | 'info'; text: string; detail?: string }

export type ScanBanner = {
  kind: BannerKind
  // ok: --ok with check-circle; info: neutral with info; bad: --bad with warning-circle.
  tone: 'ok' | 'info' | 'bad'
  title: string
  lines: ScanCheck[]
  // Under the lines: what to do next (17h), or the whole message when no check ran.
  body?: string
  // The barangay whose row lands as "Just now".
  barangay?: string
  // The words for the screen's live region.
  live: string
}

// After a report lands: how many barangays are in this week ("{5} of 5 in").
export type InCount = { received: number; expected: number }

const READ: ScanCheck = { status: 'ok', text: 'Read the QR: counts only, no names' }
const UNREADABLE: ScanCheck = { status: 'failed', text: "Couldn't read this as AgapayMo counts" }
const NOT_VALID_TITLE = 'Not a valid AgapayMo QR'
const NOT_VALID_BODY = "It isn't from a paired AgapayMo phone, so nothing was saved. Ask the health worker to open Send on AgapayMo."

const signed = (name: string, fingerprint: string): ScanCheck => ({
  status: 'ok',
  text: `Signed by the paired ${name} phone`,
  detail: `Key ${fingerprint}`,
})

// The live region's words: the title, then the line that stopped the checks
// (or the last one), then what to do next.
const spoken = (title: string, lines: ScanCheck[], body?: string) =>
  [title, lines.find((line) => line.status !== 'ok')?.text, body]
    .filter(Boolean)
    .map((part) => (/[.!?]$/.test(part!) ? part : `${part}.`))
    .join(' ')

function notValid(lines: ScanCheck[], body = NOT_VALID_BODY): ScanBanner {
  return { kind: 'not-valid', tone: 'bad', title: NOT_VALID_TITLE, lines, body, live: spoken(NOT_VALID_TITLE, lines, body) }
}

// A message with no checks (a pairing saved, or this laptop couldn't save).
export function plainBanner(kind: BannerKind, tone: ScanBanner['tone'], title: string, body: string): ScanBanner {
  return { kind, tone, title, lines: [], body, live: spoken(title, [], body) }
}

// null for a pairing QR: the officer confirms that one (see ScanPage).
export function scanBanner(
  outcome: ScanOutcome,
  { inCount, formatTime = formatClock }: { inCount?: InCount; formatTime?: (iso: string) => string } = {},
): ScanBanner | null {
  switch (outcome.kind) {
    case 'new': {
      const { payload } = outcome
      const name = nameOf(payload.barangay)
      const replaced = outcome.replaces.length > 0 ? outcome.replaces.reduce((a, b) => (compareExports(b, a) > 0 ? b : a)) : null
      const lines: ScanCheck[] = [
        READ,
        signed(name, outcome.fingerprint),
        {
          status: 'ok',
          text: replaced
            ? `Export #${payload.seq} is newer, so it replaces #${replaced.seq}.`
            : `Week ${payload.epiWeek} · export #${payload.seq}, the newest from this phone`,
        },
        { status: 'ok', text: inCount ? `Added to the merged view · ${inCount.received} of ${inCount.expected} in` : 'Added to the merged view' },
      ]
      return {
        kind: replaced ? 'updated' : 'received',
        tone: 'ok',
        title: replaced ? `${name} updated` : `${name} received`,
        lines,
        barangay: payload.barangay,
        live: inCount ? `${name} received. ${inCount.received} of ${inCount.expected} barangays in.` : `${name} received.`,
      }
    }
    case 'already-received': {
      const name = nameOf(outcome.payload.barangay)
      const lines: ScanCheck[] = [
        READ,
        signed(name, outcome.existing.keyFingerprint),
        { status: 'info', text: `Already have export #${outcome.existing.seq} from ${formatTime(outcome.existing.receivedAt)}. Nothing changed.` },
      ]
      return { kind: 'already-received', tone: 'info', title: 'Already received', lines, live: spoken('Already received', lines) }
    }
    case 'older': {
      const name = nameOf(outcome.payload.barangay)
      const lines: ScanCheck[] = [
        READ,
        signed(name, outcome.newest.keyFingerprint),
        { status: 'info', text: `Kept the newer export #${outcome.newest.seq}.` },
      ]
      return { kind: 'older', tone: 'info', title: 'Already received', lines, live: spoken('Already received', lines) }
    }
    case 'already-paired':
      return plainBanner('already-paired', 'info', `${nameOf(outcome.pairing.barangay)} is already paired`, 'Now scan the counts QR on its Send screen.')
    case 'other-municipality':
      return notValid([READ, { status: 'failed', text: 'From another municipality. Nothing was saved.' }])
    case 'invalid': {
      const name = nameOf(outcome.barangay ?? 'this barangay')
      if (outcome.source === 'counts' && outcome.code === 'bad-signature') {
        return notValid(
          [READ, { status: 'failed', text: `Not signed by the phone paired for ${name}. Nothing was saved.` }],
          `If ${name} has a new phone, pair it first.`,
        )
      }
      if (outcome.source === 'counts' && outcome.code === 'unknown-device') {
        return notValid(
          [READ, { status: 'failed', text: `No phone is paired for ${name} yet. Nothing was saved.` }],
          "Scan the pairing QR on that phone's Send screen first, then its counts QR.",
        )
      }
      // Not an AgapayMo QR, damaged, or another version.
      return notValid([UNREADABLE])
    }
    case 'pair':
      return null
  }
}

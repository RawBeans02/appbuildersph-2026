import { compareExports, type ScanOutcome } from './classify'
import { formatClock, nameOf } from '../counts'

// What one scan shows in the banner above the camera (screens 17b–17e). The
// four designed outcomes: received, already received, not valid, and newer
// replaces older. Pairing a phone is its own confirm step (not a banner).

export type BannerKind = 'received' | 'already-received' | 'not-valid' | 'updated' | 'older' | 'already-paired'

export type ScanBanner = {
  kind: BannerKind
  // ok: green with seal-check; info: neutral with info; bad: red with warning-circle.
  tone: 'ok' | 'info' | 'bad'
  title: string
  body: string
  // The barangay whose slot to mark "Just now".
  barangay?: string
}

const NOT_VALID: ScanBanner = {
  kind: 'not-valid',
  tone: 'bad',
  title: 'Not a valid AgapayMo QR',
  body: "It isn't from a paired AgapayMo phone, so nothing was saved. Ask the health worker to open Send on AgapayMo.",
}

// null for a pairing QR: the officer confirms that one (see ScanPage).
export function scanBanner(outcome: ScanOutcome, formatTime: (iso: string) => string = formatClock): ScanBanner | null {
  switch (outcome.kind) {
    case 'new': {
      const { payload } = outcome
      const name = nameOf(payload.barangay)
      if (outcome.replaces.length > 0) {
        const replaced = outcome.replaces.reduce((a, b) => (compareExports(b, a) > 0 ? b : a))
        return {
          kind: 'updated',
          tone: 'ok',
          title: `${name} updated`,
          body: `Export #${payload.seq} is newer, so it replaces #${replaced.seq}.`,
          barangay: payload.barangay,
        }
      }
      return {
        kind: 'received',
        tone: 'ok',
        title: `${name} received`,
        body: `Week ${payload.epiWeek} · export #${payload.seq} · signed by the paired ${name} phone.`,
        barangay: payload.barangay,
      }
    }
    case 'already-received':
      return {
        kind: 'already-received',
        tone: 'info',
        title: 'Already received',
        body: `${nameOf(outcome.payload.barangay)} export #${outcome.existing.seq} came in at ${formatTime(outcome.existing.receivedAt)}. Nothing changed.`,
      }
    // NEEDS DESIGN (TASKS.md B5-UI): an older export, and a phone already paired.
    case 'older':
      return {
        kind: 'older',
        tone: 'info',
        title: 'Already received',
        body: `${nameOf(outcome.payload.barangay)} export #${outcome.payload.seq} is older than #${outcome.newest.seq}, so nothing changed.`,
      }
    case 'already-paired':
      return {
        kind: 'already-paired',
        tone: 'info',
        title: `${nameOf(outcome.pairing.barangay)} is already paired`,
        body: 'Now scan the counts QR on its Send screen.',
      }
    case 'invalid':
    case 'other-municipality':
      return NOT_VALID
    case 'pair':
      return null
  }
}

import { fastBreathingCutoff, type DangerSign } from '../../rules/imci'
import type { CountRefusal } from './countSession'

// Hinga's words, from design/COPY.md (screens 2–7, L8a, L8b, L9b) word for
// word, and the few lines the screens build from them. The cut-offs come from
// src/rules/imci.ts. A line marked NEEDS DESIGN is a stand-in for a state the
// design doesn't cover yet (TASKS.md, B2-UI).

export const SCREENING_NOTE = 'Screening aid only. Not a diagnosis.'

// The age bands of step 1, as non-overlapping completed months or years
// (design pass 1b, "Age bands"): a child of exactly 12 months is "1 to 4
// years", cut-off 40, as in imci.ts. A band picked without a linked resident
// is saved as its first month, which is all the record needs: the cut-off and
// the QR's age band.
export const AGE_BANDS = [
  { firstMonth: 0, label: 'Under 2 months' },
  { firstMonth: 2, label: '2 to 11 months' },
  { firstMonth: 12, label: '1 to 4 years' },
] as const

export type AgeBand = { firstMonth: number; label: string; cutoff: number }

export function ageBand(ageMonths: number): AgeBand | null {
  const cutoff = fastBreathingCutoff(ageMonths)
  if (cutoff === null) return null
  const band = [...AGE_BANDS].reverse().find((b) => ageMonths >= b.firstMonth)!
  return { ...band, cutoff }
}

// The danger-sign rows (design pass 1b, 6a/6b): the label, the term in
// brackets (shown lighter), and the words for the URGENT band's line. Keyed in
// src/rules/imci.ts's order.
export const DANGER_SIGN_COPY: Record<DangerSign, { label: string; term: string | null; inLine: string }> = {
  'unable-to-drink': { label: "Can't drink or breastfeed", term: null, inLine: "can't drink or breastfeed" },
  'vomits-everything': { label: 'Vomits everything', term: null, inLine: 'vomits everything' },
  convulsions: { label: 'Convulsions', term: 'kombulsyon', inLine: 'convulsions' },
  lethargic: { label: 'Very sleepy or hard to wake', term: null, inLine: 'very sleepy or hard to wake' },
  'chest-indrawing': { label: 'Chest pulls in when breathing in', term: 'chest indrawing', inLine: 'chest indrawing' },
  stridor: { label: 'Harsh noise when breathing in', term: 'stridor', inLine: 'stridor' },
}

// The checklist's order on screen (pass 1b): the two breathing signs, then the
// four IMCI 2014 general danger signs. "None of these" follows them.
export const DANGER_SIGN_ROWS: readonly DangerSign[] = [
  'chest-indrawing',
  'stridor',
  'unable-to-drink',
  'vomits-everything',
  'convulsions',
  'lethargic',
]

// "a", "a and b", "a, b and c"
export function joinAnd(parts: readonly string[]): string {
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export type ResultKind = 'fast' | 'urgent' | 'not-fast'

// The result band's three lines (6a, 6b, 7a).
export function bandText(kind: ResultKind, perMin: number, band: AgeBand, signs: readonly DangerSign[]) {
  const signWords = joinAnd(signs.map((sign) => DANGER_SIGN_COPY[sign].inLine))
  switch (kind) {
    case 'fast':
      return { label: 'Fast breathing for age', perMin, line: `The cut-off for ${band.label} is ${band.cutoff}.` }
    case 'not-fast':
      return { label: 'Not fast breathing for age', perMin, line: `The cut-off for ${band.label} is ${band.cutoff}.` }
    case 'urgent':
      return {
        label: 'Urgent · danger sign',
        perMin,
        line:
          perMin >= band.cutoff
            ? `Fast for ${band.label} (cut-off ${band.cutoff}), and ${signWords}.`
            : // NEEDS DESIGN: the URGENT line when the count is under the cut-off (a sign ticked on 7a).
              `Not fast for ${band.label} (cut-off ${band.cutoff}), but ${signWords}.`,
      }
  }
}

export const HEADLINES: Record<ResultKind, { tagalog: string; english: string }> = {
  fast: { tagalog: 'I-refer ngayong araw', english: 'Refer to the midwife or RHU today.' },
  urgent: { tagalog: 'I-refer agad', english: "URGENT: bring the child to the RHU now. Don't wait for the next check." },
  'not-fast': { tagalog: 'Hindi mabilis ang paghinga', english: 'Not fast breathing for this age.' },
}

export const timeText = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// "Residente 010 · HH-02 · 1 to 4 years · 8:31 AM", plus
// "Counted by hand" for an L8b count.
export function metaLine(input: {
  resident: { name: string; householdId: string } | null
  band: AgeBand
  time: string
  method: 'camera' | 'hand'
}): string {
  return [
    ...(input.resident ? [input.resident.name, input.resident.householdId] : []),
    input.band.label,
    input.time,
    ...(input.method === 'hand' ? ['Counted by hand'] : []),
  ].join(' · ')
}

// 6c's confirmation.
export function savedText(residentName: string | null, signs: number, time: string) {
  return {
    // NEEDS DESIGN: the title when no resident is linked.
    title: residentName ? `Saved to ${residentName}'s record` : 'Saved to the record',
    detail: `${signs === 0 ? 'No danger signs' : `${signs} danger sign${signs === 1 ? '' : 's'} ticked`} · ${time}`,
  }
}

export type RefusalIcon = 'crying' | 'motion' | 'chest' | 'disagree' | 'paused'

// 5a–5d. 'no-rhythm' (no clear breathing rhythm) gets 5c's advice: better
// light and the whole chest in view. A cancelled count is not a refusal.
// `again`: the second refusal in a row (5e), when the sheet also offers the
// hand count.
export function refusalText(
  refusal: Exclude<CountRefusal, 'interrupted'>,
  again = false,
): { title: string; body: string; icon: RefusalIcon } {
  // 5e. The canvas words the motion case; NEEDS DESIGN: the second-time
  // words for the other reasons, which keep their first-time text for now.
  if (again && refusal === 'motion') {
    return {
      icon: 'motion',
      title: 'Still too much movement',
      body: 'Rest the phone on something steady and try once more, or count by hand. The app keeps the time and applies the cut-off.',
    }
  }
  switch (refusal) {
    case 'crying':
      return {
        icon: 'crying',
        title: 'Crying detected',
        body: 'Wait until the child is calm, then count again. Crying changes the breathing rate.',
      }
    case 'motion':
      return {
        icon: 'motion',
        title: 'Too much movement',
        body: 'Steady the phone. Rest your elbows on your knees or a table, and keep the chest inside the box.',
      }
    case 'no-torso':
    case 'no-rhythm':
      return {
        icon: 'chest',
        title: "Can't see the chest clearly",
        body: 'Move to brighter light or lift the shirt. Keep the whole chest inside the box.',
      }
    case 'disagree':
      return {
        icon: 'disagree',
        title: "Readings didn't agree",
        body: "The phone counted two ways and got different numbers, so this count isn't safe to use.",
      }
    case 'too-few-frames':
      // NEEDS DESIGN: a refusal for a count that got too few camera frames
      // (a slow phone, or the camera paused).
      return { icon: 'paused', title: 'The camera paused', body: 'Keep this screen open and on for the whole minute.' }
  }
}

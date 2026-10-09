import { barangayName, DEMO_BARANGAYS } from '../../src/data/places.js'
import { countRange, formatCount, formatRange, HINGA_AGE_BANDS, sumCounts, type Count, type CountRange, type QrPayloadV1 } from '../../src/qr/index.js'
import { buildPlan, FEW_IN_WATCH_WINDOW, type DoxyMove, type MunicipalPlan } from '../../src/rules/plan.js'

// The facts an alert is about, computed by fixed rules from the latest
// verified report of each barangay, and the template wording built from them
// alone. The doctor-team priority and the doxycycline moves come from
// src/rules/plan.ts, exactly as the municipal laptop computes its plan ("<5"
// is 1 to 4, so sums and scores are ranges). The template always works; the
// optional GPT-6 Luna wording (draft.ts) may only reword it.
//
// Every value here is a code, a place name from the demo list, an ISO week, a
// count as sent ("<5" stays) or a range. Nothing else exists to send.

export type AlertKind = 'doctor-team' | 'move-stock' | 'watch'

type Basis = {
  municipality: string
  epiWeek: string
  // The reports the facts come from.
  basedOn: { barangay: string; epiWeek: string; seq: number }[]
}

export type DoctorTeamFacts = Basis & {
  kind: 'doctor-team'
  barangay: string
  name: string
  score: CountRange
  urgentReferrals: Count
  fastBreathing: CountRange
  inWatchWindow: Count
}

export type MoveStockFacts = Basis & {
  kind: 'move-stock'
  from: string
  fromName: string
  to: string
  toName: string
  capsulesUpTo: Count
  fromInWatchWindow: Count
  fromOnHand: Count
  toInWatchWindow: Count
  toOnHand: Count
}

export type WatchFacts = Basis & {
  kind: 'watch'
  barangay: string
  name: string
  inWatchWindow: Count
  urgentReferrals: Count
  fastBreathing: CountRange
  clinicianReviewFlags: Count
}

export type AlertFacts = DoctorTeamFacts | MoveStockFacts | WatchFacts

export type AlertCandidate = {
  kind: AlertKind
  // The barangay the alert is mainly about (a move: where the stock is).
  barangay: string
  // Every barangay whose phone may read it once approved.
  audience: string[]
  facts: AlertFacts
  templateText: string
}

// Bounds one draft request (and so the model calls it can cause).
export const MAX_ALERTS = 8

const nameOf = (code: string) => barangayName(code) ?? code

// The safety caveats each kind of alert always carries, in its template and in
// any wording that replaces it: a GPT-6 Luna reply or an officer's edit that
// leaves one out gets it appended (withCaveats) before the check and before
// it's stored, the way the laptop's plan keeps its reminder (withReminder in
// src/features/municipal/llm/check.ts). A caveat counts as there when its
// phrase is (case and spacing aside).
export type Caveat = { phrase: string; sentence: string }

export const DOXY_CAVEAT = 'Doxycycline is given only after consultation with a health professional.'
export const MHO_CONDITION = 'if the municipal health officer agrees'
export const DOCTOR_TEAM_CAVEAT = 'The score ranks barangays by screening counts only; the doctor team decides who needs care.'
export const WATCH_CAVEAT = 'Refer anyone with fever, muscle pain or red eyes to the RHU; a health professional decides who needs care.'

const wholeSentence = (text: string): Caveat => ({ phrase: text.replace(/\.$/, ''), sentence: text })

export const CAVEATS: Record<AlertKind, readonly Caveat[]> = {
  'doctor-team': [wholeSentence(DOCTOR_TEAM_CAVEAT)],
  'move-stock': [{ phrase: MHO_CONDITION, sentence: `Go ahead only ${MHO_CONDITION}.` }, wholeSentence(DOXY_CAVEAT)],
  watch: [wholeSentence(WATCH_CAVEAT)],
}

const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, ' ')

// The wording with every caveat of its kind: unchanged when all are there,
// else the missing ones appended after a blank line.
export function withCaveats(text: string, kind: AlertKind): string {
  const have = normalized(text)
  const missing = CAVEATS[kind].filter((caveat) => !have.includes(normalized(caveat.phrase))).map((caveat) => caveat.sentence)
  return missing.length ? `${text.trim()}\n\n${missing.join(' ')}` : text
}

function doctorTeamText(facts: DoctorTeamFacts): string {
  return (
    `Send a doctor team to ${facts.name} first this week (${facts.epiWeek}). ` +
    `${facts.name} has the highest priority score, ${formatRange(facts.score)}: ` +
    `${formatCount(facts.urgentReferrals)} urgent danger-sign referrals ×3, ` +
    `${formatRange(facts.fastBreathing)} fast-breathing referrals ×2 and ` +
    `${formatCount(facts.inWatchWindow)} residents in the leptospirosis watch window ×1. ` +
    DOCTOR_TEAM_CAVEAT
  )
}

function moveStockText(facts: MoveStockFacts): string {
  const amount = facts.capsulesUpTo === '<5' ? 'the few (<5)' : `up to ${formatCount(facts.capsulesUpTo)}`
  return (
    `Move ${amount} doxycycline capsules that expire within 6 weeks from ${facts.fromName} to ${facts.toName}, ` +
    `${MHO_CONDITION}. ` +
    `${facts.fromName} has ${formatCount(facts.fromInWatchWindow)} residents in the watch window and ` +
    `${formatCount(facts.fromOnHand)} capsules on hand; ${facts.toName} has ${formatCount(facts.toInWatchWindow)} ` +
    `in the watch window and ${formatCount(facts.toOnHand)} capsules on hand. ` +
    DOXY_CAVEAT
  )
}

function watchText(facts: WatchFacts): string {
  return (
    `${facts.name} has ${formatCount(facts.inWatchWindow)} residents in the leptospirosis watch window this week ` +
    `(${facts.epiWeek}), day 5 to 15 after floodwater contact, with ${formatCount(facts.urgentReferrals)} urgent ` +
    `referrals, ${formatRange(facts.fastBreathing)} fast-breathing referrals and ` +
    `${formatCount(facts.clinicianReviewFlags)} flags for clinician review. ` +
    `Keep up the watch checks. ${WATCH_CAVEAT}`
  )
}

export function templateText(facts: AlertFacts): string {
  switch (facts.kind) {
    case 'doctor-team':
      return doctorTeamText(facts)
    case 'move-stock':
      return moveStockText(facts)
    case 'watch':
      return watchText(facts)
  }
}

const fastOf = (counts: QrPayloadV1['counts']) => sumCounts(HINGA_AGE_BANDS.map((band) => counts.fastBreathing[band]))

function moveFacts(basis: Basis, move: DoxyMove): MoveStockFacts {
  return {
    ...basis,
    kind: 'move-stock',
    from: move.from,
    fromName: move.fromName,
    to: move.to,
    toName: move.toName,
    capsulesUpTo: move.capsulesUpTo,
    fromInWatchWindow: move.why.fromInWatchWindow,
    fromOnHand: move.why.fromOnHand,
    toInWatchWindow: move.why.toInWatchWindow,
    toOnHand: move.why.toOnHand,
  }
}

// The alerts the facts call for, in a fixed order: the first doctor team (when
// any barangay scores above 0), every suggested stock move, then a watch alert
// for each barangay with 5 or more residents in the watch window (most first).
// Same reports in, same alerts out.
export function alertCandidates(payloads: readonly QrPayloadV1[]): AlertCandidate[] {
  const result = buildPlan(payloads)
  if (!result.ok) return []
  const plan: MunicipalPlan = result.plan
  const basis: Basis = {
    municipality: plan.municipality,
    epiWeek: plan.epiWeek,
    basedOn: plan.rows.map((row) => ({ barangay: row.barangay, epiWeek: row.epiWeek, seq: row.seq })),
  }
  const candidates: AlertCandidate[] = []
  const add = (facts: AlertFacts, barangay: string, audience: string[]) =>
    candidates.push({ kind: facts.kind, barangay, audience, facts, templateText: templateText(facts) })

  const first = plan.priority[0]
  if (first && first.score.max > 0) {
    const row = plan.rows.find((item) => item.barangay === first.barangay)!
    add(
      {
        ...basis,
        kind: 'doctor-team',
        barangay: first.barangay,
        name: first.name,
        score: first.score,
        urgentReferrals: row.counts.urgentReferrals,
        fastBreathing: fastOf(row.counts),
        inWatchWindow: row.counts.inWatchWindow,
      },
      first.barangay,
      [first.barangay],
    )
  }
  for (const move of plan.moves) add(moveFacts(basis, move), move.from, [move.from, move.to])

  const watched = plan.rows
    .filter((row) => countRange(row.counts.inWatchWindow).min >= FEW_IN_WATCH_WINDOW)
    .sort((a, b) => countRange(b.counts.inWatchWindow).min - countRange(a.counts.inWatchWindow).min || (a.name < b.name ? -1 : 1))
  for (const row of watched) {
    add(
      {
        ...basis,
        kind: 'watch',
        barangay: row.barangay,
        name: row.name,
        inWatchWindow: row.counts.inWatchWindow,
        urgentReferrals: row.counts.urgentReferrals,
        fastBreathing: fastOf(row.counts),
        clinicianReviewFlags: row.counts.clinicianReviewFlags,
      },
      row.barangay,
      [row.barangay],
    )
  }
  return candidates.slice(0, MAX_ALERTS)
}

// Every barangay name the check should know: the demo list and the reports'.
export function knownNames(facts: AlertFacts): string[] {
  return [...new Set([...DEMO_BARANGAYS.map((place) => place.name), ...facts.basedOn.map((item) => nameOf(item.barangay))])]
}

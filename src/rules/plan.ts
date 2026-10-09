import { barangayName } from '../data/places'
import {
  countRange,
  formatCount,
  formatRange,
  sumCounts,
  type Count,
  type CountRange,
  type Counts,
  type CountsOf,
  type QrPayloadV1,
} from '../qr'
import { COUNT_FIELDS, flattenCounts, HINGA_AGE_BANDS, unflattenCounts } from '../qr/schema'
import { SMALL_CELL_LIMIT } from '../qr/suppress'

// The municipal plan: deterministic, explainable rules over the verified,
// de-identified barangay counts. The plan is a suggestion for the municipal
// health officer to edit and approve. It never diagnoses anyone and never sets
// a dose: the doxycycline part is about moving stock between barangays, and
// DOH says doxycycline only after consultation with a health professional.
//
// (a) Doctor-team priority: a score per barangay,
//       urgent danger-sign referrals × 3
//     + Hinga fast-breathing referrals × 2
//     + residents in the leptospirosis watch window × 1.
//     A "<5" cell is 1 to 4, so a score is a range. Order: highest minimum
//     first, then highest maximum, then alphabetically.
// (b) Doxycycline moves: capsules expiring within 6 weeks, in a barangay with
//     few or no residents in the watch window (fewer than 5: 0 or "<5"), are
//     suggested to move to a barangay with 5 or more, picked by most residents
//     in the window and fewest capsules on hand. Up to the source's expiring
//     count; never a per-person amount.
// (c) A plain-language template text built only from these numbers.
//
// Weeks: each barangay counts with its most recent QR. The pre-made sample QRs
// are signed for one week, and the live phone's week moves on, so a merge that
// refused mixed weeks would drop the samples; instead a row from an earlier
// week is kept and marked, and the text names it.

export const PRIORITY_WEIGHTS = { urgentReferrals: 3, fastBreathing: 2, inWatchWindow: 1 } as const

// "Few" residents in the watch window: fewer than 5, the same line the QR uses
// for small cells, so it reads straight off a cell (0 or "<5").
export const FEW_IN_WATCH_WINDOW = SMALL_CELL_LIMIT

export type PlanRow = {
  barangay: string
  name: string
  epiWeek: string
  seq: number
  counts: Counts
  // This barangay's latest QR is from an earlier week than the newest one.
  olderWeek: boolean
  // Pre-made sample data rather than a live phone.
  sample: boolean
}

export type ScoreComponentKey = keyof typeof PRIORITY_WEIGHTS

export type ScoreComponent = {
  key: ScoreComponentKey
  label: string
  // The count as shown: a cell as sent ("<5"), or a range for a sum of cells.
  shown: string
  count: CountRange
  weight: number
  points: CountRange
}

export type PriorityEntry = {
  // 1 = visit first. Equal scores get consecutive ranks, alphabetically.
  rank: number
  barangay: string
  name: string
  score: CountRange
  components: ScoreComponent[]
  // Other barangays with exactly the same score range.
  tiedWith: string[]
}

export type DoxyMove = {
  from: string
  fromName: string
  to: string
  toName: string
  // Up to the source's capsules expiring within 6 weeks, as sent ("<5" stays).
  capsulesUpTo: Count
  why: {
    fromInWatchWindow: Count
    fromOnHand: Count
    fromExpiring: Count
    toInWatchWindow: Count
    toOnHand: Count
    // The target's rank among the targets: by most residents in the watch
    // window, and by fewest capsules on hand (1 = most / fewest).
    toWatchRank: number
    toOnHandRank: number
  }
}

// Why no move is suggested.
export type NoMoveReason =
  | 'single-barangay'
  | 'no-doxycycline'
  | 'none-expiring'
  | 'expiring-where-needed'
  | 'no-target'

export type MunicipalPlan = {
  municipality: string
  // The newest week among the rows.
  epiWeek: string
  // One per barangay, its most recent QR, alphabetical.
  rows: PlanRow[]
  // Older QRs of the same barangays, not used.
  superseded: { barangay: string; epiWeek: string; seq: number }[]
  totals: CountsOf<CountRange>
  priority: PriorityEntry[]
  moves: DoxyMove[]
  noMoveReason: NoMoveReason | null
}

export type PlanResult =
  | { ok: true; plan: MunicipalPlan }
  | { ok: false; code: 'empty' | 'mixed-municipalities'; message: string }

const compareNames = (a: { name: string; barangay: string }, b: { name: string; barangay: string }) =>
  a.name.localeCompare(b.name, 'en') || (a.barangay < b.barangay ? -1 : a.barangay > b.barangay ? 1 : 0)

// Newest = the latest ISO week ("2026-W41" sorts as text), then the highest seq.
const isNewer = (a: QrPayloadV1, b: QrPayloadV1) => a.epiWeek > b.epiWeek || (a.epiWeek === b.epiWeek && a.seq >= b.seq)

// Each barangay's most recent QR. On an exact tie (the same QR twice) the later
// one in the list is kept.
export function latestPerBarangay(payloads: readonly QrPayloadV1[]): {
  kept: QrPayloadV1[]
  superseded: QrPayloadV1[]
} {
  const latest = new Map<string, QrPayloadV1>()
  const superseded: QrPayloadV1[] = []
  for (const payload of payloads) {
    const current = latest.get(payload.barangay)
    if (!current) {
      latest.set(payload.barangay, payload)
    } else if (isNewer(payload, current)) {
      superseded.push(current)
      latest.set(payload.barangay, payload)
    } else {
      superseded.push(payload)
    }
  }
  return { kept: [...latest.values()], superseded }
}

const times = (range: CountRange, weight: number): CountRange => ({ min: range.min * weight, max: range.max * weight })

export function priorityComponents(counts: Counts): ScoreComponent[] {
  const fast = sumCounts(HINGA_AGE_BANDS.map((band) => counts.fastBreathing[band]))
  const parts: { key: ScoreComponentKey; label: string; shown: string; count: CountRange }[] = [
    {
      key: 'urgentReferrals',
      label: 'urgent danger-sign referrals',
      shown: formatCount(counts.urgentReferrals),
      count: countRange(counts.urgentReferrals),
    },
    { key: 'fastBreathing', label: 'fast-breathing referrals (Hinga)', shown: formatRange(fast), count: fast },
    {
      key: 'inWatchWindow',
      label: 'residents in the watch window',
      shown: formatCount(counts.inWatchWindow),
      count: countRange(counts.inWatchWindow),
    },
  ]
  return parts.map((part) => ({
    ...part,
    weight: PRIORITY_WEIGHTS[part.key],
    points: times(part.count, PRIORITY_WEIGHTS[part.key]),
  }))
}

export function priorityScore(counts: Counts): CountRange {
  return priorityComponents(counts).reduce(
    (sum, part) => ({ min: sum.min + part.points.min, max: sum.max + part.points.max }),
    { min: 0, max: 0 },
  )
}

export function rankPriority(rows: readonly PlanRow[]): PriorityEntry[] {
  const scored = rows.map((row) => ({
    barangay: row.barangay,
    name: row.name,
    score: priorityScore(row.counts),
    components: priorityComponents(row.counts),
  }))
  scored.sort((a, b) => b.score.min - a.score.min || b.score.max - a.score.max || compareNames(a, b))
  return scored.map((entry, i) => ({
    rank: i + 1,
    ...entry,
    tiedWith: scored
      .filter((other) => other !== entry && other.score.min === entry.score.min && other.score.max === entry.score.max)
      .map((other) => other.barangay),
  }))
}

// Competition ranking ("1224"): 1 + how many come strictly before.
function competitionRanks<T>(items: readonly T[], before: (a: T, b: T) => boolean): number[] {
  return items.map((item) => 1 + items.filter((other) => before(other, item)).length)
}

const moreThan = (a: CountRange, b: CountRange) => a.min > b.min || (a.min === b.min && a.max > b.max)

const isFewInWatchWindow = (row: PlanRow) => countRange(row.counts.inWatchWindow).max < FEW_IN_WATCH_WINDOW

export function suggestDoxyMoves(rows: readonly PlanRow[]): { moves: DoxyMove[]; noMoveReason: NoMoveReason | null } {
  const none = (noMoveReason: NoMoveReason) => ({ moves: [], noMoveReason })
  if (rows.length < 2) return none('single-barangay')
  if (rows.every((row) => row.counts.doxyCapsulesOnHand === 0)) return none('no-doxycycline')
  if (rows.every((row) => row.counts.doxyCapsulesExpiring6w === 0)) return none('none-expiring')

  const expiring = (row: PlanRow) => countRange(row.counts.doxyCapsulesExpiring6w)
  const sources = rows
    .filter((row) => isFewInWatchWindow(row) && row.counts.doxyCapsulesExpiring6w !== 0)
    .sort((a, b) => (moreThan(expiring(a), expiring(b)) ? -1 : moreThan(expiring(b), expiring(a)) ? 1 : compareNames(a, b)))
  if (sources.length === 0) return none('expiring-where-needed')

  const candidates = rows.filter((row) => !isFewInWatchWindow(row))
  if (candidates.length === 0) return none('no-target')
  const watch = (row: PlanRow) => countRange(row.counts.inWatchWindow)
  const onHand = (row: PlanRow) => countRange(row.counts.doxyCapsulesOnHand)
  const watchRanks = competitionRanks(candidates, (a, b) => moreThan(watch(a), watch(b)))
  const onHandRanks = competitionRanks(candidates, (a, b) => moreThan(onHand(b), onHand(a)))
  // Both criteria count the same: the lowest sum of the two ranks goes first;
  // then most residents in the window, then fewest capsules, then the name.
  const targets = candidates
    .map((row, i) => ({ row, watchRank: watchRanks[i], onHandRank: onHandRanks[i] }))
    .sort(
      (a, b) =>
        a.watchRank + a.onHandRank - (b.watchRank + b.onHandRank) ||
        a.watchRank - b.watchRank ||
        a.onHandRank - b.onHandRank ||
        compareNames(a.row, b.row),
    )

  // The largest expiring stock goes to the first target, the next to the
  // second, and so on, round again if there are more sources than targets.
  const moves = sources.map((source, i): DoxyMove => {
    const target = targets[i % targets.length]
    return {
      from: source.barangay,
      fromName: source.name,
      to: target.row.barangay,
      toName: target.row.name,
      capsulesUpTo: source.counts.doxyCapsulesExpiring6w,
      why: {
        fromInWatchWindow: source.counts.inWatchWindow,
        fromOnHand: source.counts.doxyCapsulesOnHand,
        fromExpiring: source.counts.doxyCapsulesExpiring6w,
        toInWatchWindow: target.row.counts.inWatchWindow,
        toOnHand: target.row.counts.doxyCapsulesOnHand,
        toWatchRank: target.watchRank,
        toOnHandRank: target.onHandRank,
      },
    }
  })
  return { moves, noMoveReason: null }
}

export type PlanOptions = {
  // Barangay codes whose QRs are pre-made sample data.
  sampleBarangays?: ReadonlySet<string>
}

// Payloads must come from decodeQr (verified).
export function buildPlan(payloads: readonly QrPayloadV1[], options: PlanOptions = {}): PlanResult {
  if (payloads.length === 0) return { ok: false, code: 'empty', message: 'No barangay QR codes yet.' }
  const municipalities = new Set(payloads.map((payload) => payload.municipality))
  if (municipalities.size > 1) {
    return {
      ok: false,
      code: 'mixed-municipalities',
      message: `The QR codes are from different municipalities: ${[...municipalities].sort().join(', ')}.`,
    }
  }
  const { kept, superseded } = latestPerBarangay(payloads)
  const epiWeek = kept.reduce((newest, payload) => (payload.epiWeek > newest ? payload.epiWeek : newest), kept[0].epiWeek)
  const rows: PlanRow[] = kept
    .map((payload) => ({
      barangay: payload.barangay,
      name: barangayName(payload.barangay) ?? payload.barangay,
      epiWeek: payload.epiWeek,
      seq: payload.seq,
      counts: payload.counts,
      olderWeek: payload.epiWeek !== epiWeek,
      sample: options.sampleBarangays?.has(payload.barangay) ?? false,
    }))
    .sort(compareNames)

  const columns: Count[][] = Array.from({ length: COUNT_FIELDS }, () => [])
  for (const row of rows) flattenCounts(row.counts).forEach((count, i) => columns[i].push(count))
  const totals = unflattenCounts(columns.map(sumCounts))

  return {
    ok: true,
    plan: {
      municipality: [...municipalities][0],
      epiWeek,
      rows,
      superseded: superseded.map(({ barangay, epiWeek: week, seq }) => ({ barangay, epiWeek: week, seq })),
      totals,
      priority: rankPriority(rows),
      ...suggestDoxyMoves(rows),
    },
  }
}

// --- The template text --------------------------------------------------------

const NO_MOVE_TEXT: Record<NoMoveReason, string> = {
  'single-barangay': 'only one barangay has sent counts, so there is nowhere to move stock between.',
  'no-doxycycline': 'no barangay reported doxycycline on hand.',
  'none-expiring': 'no barangay reported capsules expiring within 6 weeks.',
  'expiring-where-needed':
    'every barangay with capsules expiring within 6 weeks has 5 or more residents in the watch window, so that stock stays there.',
  'no-target': 'no barangay has 5 or more residents in the watch window.',
}

function scoreLine(entry: PriorityEntry): string {
  const parts = entry.components.map((part) => `${part.shown} ${part.label} ×${part.weight} (${formatRange(part.points)})`)
  return `${entry.rank}. ${entry.name}: score ${formatRange(entry.score)} = ${parts.join(' + ')}`
}

function moveLine(move: DoxyMove): string {
  const amount =
    move.capsulesUpTo === '<5' ? 'the few (<5) capsules' : `up to ${formatCount(move.capsulesUpTo)} capsules`
  return (
    `- ${move.fromName} to ${move.toName}: ${amount} that expire within 6 weeks. ` +
    `${move.fromName} has ${formatCount(move.why.fromInWatchWindow)} residents in the watch window and ` +
    `${formatCount(move.why.fromOnHand)} capsules on hand; ${move.toName} has ` +
    `${formatCount(move.why.toInWatchWindow)} residents in the watch window and ${formatCount(move.why.toOnHand)} capsules on hand.`
  )
}

// Plain-language text from the plan's numbers only, English with short
// Tagalog. The officer edits it before approving; an optional local model
// (B6) may only rephrase it.
export function planTemplateText(plan: MunicipalPlan, municipalityName?: string): string {
  const place = municipalityName ? `${municipalityName} (${plan.municipality})` : plan.municipality
  const lines: string[] = [
    `Draft plan for week ${plan.epiWeek}, ${place}`,
    'Para sa pagsusuri at pag-apruba ng MHO: review, edit, then approve.',
    '',
    'Doctor teams, in priority order (unahin ang nasa itaas):',
    ...plan.priority.map(scoreLine),
  ]
  if (plan.priority.some((entry) => entry.tiedWith.length > 0)) lines.push('Equal scores are listed alphabetically.')
  lines.push('', 'Doxycycline stock moves, for the MHO to decide (ilipat lamang kung aprubado):')
  if (plan.moves.length > 0) lines.push(...plan.moves.map(moveLine))
  else lines.push(`No stock move suggested: ${plan.noMoveReason ? NO_MOVE_TEXT[plan.noMoveReason] : ''}`)

  const basis = plan.rows.map((row) => `${row.name} export ${row.seq} (${row.epiWeek}${row.sample ? ', sample data' : ''})`)
  lines.push('', `Batayan (based on): ${basis.join('; ')}.`)
  const older = plan.rows.filter((row) => row.olderWeek)
  if (older.length > 0) {
    lines.push(`Older week: ${older.map((row) => `${row.name} last sent week ${row.epiWeek}`).join('; ')}.`)
  }
  lines.push(
    '',
    'Paalala: counts only, no names. "<5" means 1 to 4, so scores and totals that include one are ranges. ' +
      'The watch window is day 5 to 15 after floodwater contact. This plan does not diagnose anyone and sets no dose; ' +
      'doxycycline only after consultation with a health professional.',
  )
  return lines.join('\n')
}

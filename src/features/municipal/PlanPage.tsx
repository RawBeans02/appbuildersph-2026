import { useState } from 'react'
import { Link } from '../../app/Link'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery } from '../../data/db/useDbQuery'
import { barangayName, DEMO_BARANGAYS, DEMO_MUNICIPALITY } from '../../data/places'
import { AGE_BANDS, formatCount, formatRange, HINGA_AGE_BANDS, sumCounts, type Count, type CountRange } from '../../qr'
import {
  buildPlan,
  FEW_IN_WATCH_WINDOW,
  planTemplateText,
  PRIORITY_WEIGHTS,
  type DoxyMove,
  type MunicipalPlan,
  type PlanRow,
} from '../../rules/plan'
import { APPROVER, approvePlan, ensureMunicipalSample, readPlanInputs } from './municipal'

// Screens 18–19: the merged table, the rule-based plan with its reasons, and
// the editable text the officer approves. Plain until design/ lands.
// NEEDS DESIGN: screens 18–19.

const readPlanScreen = async (db: AgapayDb) => {
  await ensureMunicipalSample(db)
  return readPlanInputs(db)
}

const nameOf = (code: string) => barangayName(code) ?? code
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`
const addRanges = (ranges: CountRange[]): CountRange =>
  ranges.reduce((sum, range) => ({ min: sum.min + range.min, max: sum.max + range.max }), { min: 0, max: 0 })

export default function PlanPage() {
  const data = useDbQuery(['pairedDevices', 'receivedPayloads'], readPlanScreen)

  if (data.status === 'loading') return <p>Loading…</p>
  if (data.status === 'error') return <p role="alert">Could not read this laptop’s records.</p>

  const { payloads, unverified, sampleBarangays } = data.data
  const result = buildPlan(payloads, { sampleBarangays })
  if (!result.ok) {
    return (
      <>
        <h1>Municipal plan</h1>
        <p>{result.message}</p>
        <p>
          <Link to="/municipal">Scan the barangays’ QR codes</Link>
        </p>
      </>
    )
  }
  const { plan } = result
  const missing = DEMO_BARANGAYS.filter((place) => !plan.rows.some((row) => row.barangay === place.code))
  const draft = planTemplateText(plan, DEMO_MUNICIPALITY.name)
  const basis = plan.rows.map((row) => `${row.barangay}:${row.epiWeek}:${row.seq}`).join('|')

  return (
    <>
      <h1>Municipal plan, week {plan.epiWeek}</h1>
      <p>
        {plan.rows.length} of {DEMO_BARANGAYS.length} barangays received.{' '}
        {missing.length > 0 && (
          <>
            Waiting for {missing.map((place) => place.name).join(', ')}: <Link to="/municipal">scan</Link>.
          </>
        )}
      </p>
      {plan.rows.some((row) => row.sample) && (
        <p>Sample data: {plan.rows.filter((row) => row.sample).map((row) => row.name).join(', ')} are pre-made demo QRs.</p>
      )}
      {unverified.length > 0 && (
        <p role="alert">
          {unverified.length} stored QR code{unverified.length === 1 ? '' : 's'} no longer match the paired phone’s key and
          {unverified.length === 1 ? ' is' : ' are'} left out: {unverified.map((item) => nameOf(item.barangay)).join(', ')}.
        </p>
      )}

      <MergedTable plan={plan} />
      <Priority plan={plan} />
      <Moves plan={plan} />
      <HowComputed />
      <PlanEditor key={basis} plan={plan} draft={draft} />
    </>
  )
}

function rowTotals(counts: PlanRow['counts']) {
  return {
    exposed: sumCounts(AGE_BANDS.map((band) => counts.exposed[band])),
    fast: sumCounts(HINGA_AGE_BANDS.map((band) => counts.fastBreathing[band])),
  }
}

export function MergedTable({ plan }: { plan: MunicipalPlan }) {
  const { totals } = plan
  const cell = (count: Count) => formatCount(count)
  return (
    <section aria-labelledby="table-heading">
      <h2 id="table-heading">Merged counts</h2>
      <table>
        <caption>
          Counts as each barangay sent them. "&lt;5" means 1 to 4; a sum that includes one is a range.
        </caption>
        <thead>
          <tr>
            <th scope="col">Barangay</th>
            <th scope="col">Week</th>
            <th scope="col">Export</th>
            <th scope="col">Exposed to floodwater (all ages)</th>
            <th scope="col">In the watch window now</th>
            <th scope="col">Fast-breathing referrals (Hinga)</th>
            <th scope="col">Urgent danger-sign referrals</th>
            <th scope="col">Doxycycline capsules on hand</th>
            <th scope="col">Of those, expiring within 6 weeks</th>
            <th scope="col">Flags for clinician review</th>
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((row) => {
            const sums = rowTotals(row.counts)
            return (
              <tr key={row.barangay}>
                <th scope="row">
                  {row.name}
                  {row.sample ? ' (sample data)' : ''}
                </th>
                <td>
                  {row.epiWeek}
                  {row.olderWeek ? ' (older week)' : ''}
                </td>
                <td>{row.seq}</td>
                <td>{formatRange(sums.exposed)}</td>
                <td>{cell(row.counts.inWatchWindow)}</td>
                <td>{formatRange(sums.fast)}</td>
                <td>{cell(row.counts.urgentReferrals)}</td>
                <td>{cell(row.counts.doxyCapsulesOnHand)}</td>
                <td>{cell(row.counts.doxyCapsulesExpiring6w)}</td>
                <td>{cell(row.counts.clinicianReviewFlags)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All {plan.rows.length}</th>
            <td colSpan={2} />
            <td>{formatRange(addRanges(AGE_BANDS.map((band) => totals.exposed[band])))}</td>
            <td>{formatRange(totals.inWatchWindow)}</td>
            <td>{formatRange(addRanges(HINGA_AGE_BANDS.map((band) => totals.fastBreathing[band])))}</td>
            <td>{formatRange(totals.urgentReferrals)}</td>
            <td>{formatRange(totals.doxyCapsulesOnHand)}</td>
            <td>{formatRange(totals.doxyCapsulesExpiring6w)}</td>
            <td>{formatRange(totals.clinicianReviewFlags)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

export function Priority({ plan }: { plan: MunicipalPlan }) {
  return (
    <section aria-labelledby="priority-heading">
      <h2 id="priority-heading">Doctor teams: priority order</h2>
      <ol>
        {plan.priority.map((entry) => (
          <li key={entry.barangay}>
            <strong>{entry.name}</strong>: score {formatRange(entry.score)}
            <br />
            Why:{' '}
            {entry.components
              .map((part) => `${part.shown} ${part.label} ×${part.weight} = ${formatRange(part.points)}`)
              .join('; ')}
            .
            {entry.tiedWith.length > 0 && (
              <>
                <br />
                Same score as {entry.tiedWith.map(nameOf).join(', ')}; listed alphabetically.
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

const NO_MOVE: Record<NonNullable<MunicipalPlan['noMoveReason']>, string> = {
  'single-barangay': 'Only one barangay has sent counts.',
  'no-doxycycline': 'No barangay reported doxycycline on hand.',
  'none-expiring': 'No barangay reported capsules expiring within 6 weeks.',
  'expiring-where-needed': `Every barangay with expiring capsules has ${FEW_IN_WATCH_WINDOW} or more residents in the watch window, so that stock stays there.`,
  'no-target': `No barangay has ${FEW_IN_WATCH_WINDOW} or more residents in the watch window.`,
}

function moveReason(move: DoxyMove): string {
  const { why } = move
  return (
    `${move.fromName} has ${formatCount(why.fromInWatchWindow)} residents in the watch window (fewer than ${FEW_IN_WATCH_WINDOW}) ` +
    `and ${formatCount(why.fromOnHand)} capsules on hand, ${formatCount(why.fromExpiring)} of them expiring within 6 weeks. ` +
    `${move.toName} is ${ordinal(why.toWatchRank)} by residents in the watch window (${formatCount(why.toInWatchWindow)}) ` +
    `and ${ordinal(why.toOnHandRank)} by fewest capsules on hand (${formatCount(why.toOnHand)}).`
  )
}

export function Moves({ plan }: { plan: MunicipalPlan }) {
  return (
    <section aria-labelledby="moves-heading">
      <h2 id="moves-heading">Doxycycline stock moves, for the MHO to decide</h2>
      {plan.moves.length === 0 ? (
        <p>No move suggested. {plan.noMoveReason ? NO_MOVE[plan.noMoveReason] : ''}</p>
      ) : (
        <ul>
          {plan.moves.map((move) => (
            <li key={`${move.from}-${move.to}`}>
              <strong>
                {move.fromName} to {move.toName}
              </strong>
              : {move.capsulesUpTo === '<5' ? 'the few (<5)' : `up to ${formatCount(move.capsulesUpTo)}`} capsules that
              expire within 6 weeks.
              <br />
              Why: {moveReason(move)}
            </li>
          ))}
        </ul>
      )}
      <p>
        Stock logistics only, never a dose or an amount per person. DOH: doxycycline only after consultation with a
        health professional.
      </p>
    </section>
  )
}

function HowComputed() {
  return (
    <details>
      <summary>How this plan is computed</summary>
      <ul>
        <li>
          Doctor-team score = urgent danger-sign referrals ×{PRIORITY_WEIGHTS.urgentReferrals} + fast-breathing referrals
          ×{PRIORITY_WEIGHTS.fastBreathing} + residents in the watch window ×{PRIORITY_WEIGHTS.inWatchWindow}. A "&lt;5"
          cell counts as 1 to 4, so a score can be a range: the highest minimum goes first, then the highest maximum,
          then the name.
        </li>
        <li>
          Doxycycline: capsules expiring within 6 weeks in a barangay with fewer than {FEW_IN_WATCH_WINDOW} residents in
          the watch window (0 or "&lt;5") are suggested to move to a barangay with {FEW_IN_WATCH_WINDOW} or more. The
          target is ranked by most residents in the window and by fewest capsules on hand, both counting the same; up to
          the source’s expiring count.
        </li>
        <li>Each barangay counts with its most recent QR; a row from an earlier week is marked.</li>
        <li>The same QR codes always give the same plan. Nothing is sent anywhere.</li>
      </ul>
    </details>
  )
}

export function PlanEditor({ plan, draft }: { plan: MunicipalPlan; draft: string }) {
  const [text, setText] = useState(draft)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [approved, setApproved] = useState<{ at: string; text: string; note: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const unchangedSinceApproval = approved !== null && approved.text === text && approved.note === note

  async function onApprove() {
    setSaving(true)
    setProblem(null)
    try {
      const now = new Date()
      await approvePlan(await getDb(), { plan, draftText: draft, finalText: text, note, now })
      setApproved({ at: now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }), text, note })
    } catch {
      setProblem('Could not save the approval on this laptop. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="editor-heading">
      <h2 id="editor-heading">Plan text</h2>
      <p>Built from the numbers above. Edit it as needed, then approve. The approval is logged on this laptop.</p>
      <p>
        <label>
          Plan text
          <br />
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={18} cols={100} />
        </label>
      </p>
      <p>
        <button type="button" onClick={() => setText(draft)} disabled={text === draft}>
          Start again from the computed text
        </button>
      </p>
      <p>
        <label>
          Note for the log (optional) <input value={note} onChange={(event) => setNote(event.target.value)} size={60} />
        </label>
      </p>
      <button type="button" onClick={() => void onApprove()} disabled={saving || !text.trim() || unchangedSinceApproval}>
        {saving ? 'Saving…' : 'Approve plan'}
      </button>
      {problem && <p role="alert">{problem}</p>}
      {approved && (
        <p role="status">
          Approved and logged at {approved.at} (approver: {APPROVER}). <Link to="/municipal/log">See the log</Link>.
        </p>
      )}
    </section>
  )
}

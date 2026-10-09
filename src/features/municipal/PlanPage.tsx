import {
  CaretDownIcon,
  CheckIcon,
  CircleNotchIcon,
  InfoIcon,
  ListNumbersIcon,
  QrCodeIcon,
  ScanIcon,
  SealCheckIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Button, ButtonLink, Field, StateBlock, useToast } from '../../components'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import { DEMO_MUNICIPALITY } from '../../data/places'
import { clockTime, dateTime } from '../../lib/format'
import { useHoldReload } from '../../lib/useHoldReload'
import { useDbQuery } from '../../data/db/useDbQuery'
import { planTemplateText, type MunicipalPlan } from '../../rules/plan'
import { CheckedWording } from './CheckedWording'
import { barangayCodes } from './counts'
import { LaptopFrame } from './LaptopFrame'
import { LlmWordingPanel } from './llm'
import { APPROVER, approvePlan, readMunicipalScreen } from './municipal'
import { checkNumbers } from './numberCheck'
import { useLaptopPlace } from './place'
import styles from './PlanPage.module.css'
import { planChangedSinceShown, rememberPlanShown } from './planShown'
import { planShortSummary, planSteps, planStepsText } from './steps'

// Screen 19a: the rule-based plan on the left (always there, with or without
// the AI), the optional on-device AI's card on the right with the officer's
// wording box inside it, checked number by number against the plan, and
// Approve. The approver is a role, never a name. Never a dose.

export default function PlanPage() {
  const data = useDbQuery(['pairedDevices', 'receivedPayloads'], readMunicipalScreen)
  const { sample } = useLaptopPlace()

  if (data.status !== 'ready') {
    return (
      <LaptopFrame active="plan" title="Plan">
        {data.status === 'loading' ? (
          <p className={styles.note}>Opening the records on this laptop…</p>
        ) : (
          <StateBlock tone="error" icon={WarningCircleIcon} title="Couldn't open the records" body="Nothing was lost. Your records are still saved on this laptop.">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </StateBlock>
        )}
      </LaptopFrame>
    )
  }

  const { plan, handoff } = data.data
  if (!plan) {
    // B24: the plan with no reports yet.
    return (
      <LaptopFrame active="plan" title="Plan">
        <StateBlock icon={ListNumbersIcon} title="No reports yet" body="The plan appears when the first barangay QR comes in.">
          <ButtonLink to="/municipal" icon={<ScanIcon size={22} weight="bold" aria-hidden />}>
            Scan a barangay QR
          </ButtonLink>
        </StateBlock>
      </LaptopFrame>
    )
  }

  const expected = barangayCodes([...plan.rows, ...handoff.devices, ...handoff.received].map((item) => item.barangay)).length
  const basis = plan.rows.map((row) => `${row.barangay}:${row.epiWeek}:${row.seq}`).join('|')
  return (
    <LaptopFrame
      active="plan"
      title={`Plan for week ${plan.epiWeek}`}
      sub={[`From ${plan.rows.length} of ${expected} barangays`, sample ? 'Sample data' : null].filter(Boolean).join(' · ')}
    >
      <PlanBody
        key={basis}
        plan={plan}
        wordingPanel={LlmWordingPanel}
        basis={{ received: plan.rows.length, expected, latestAt: latestReceivedAt(handoff.received, plan) }}
        basisKey={basis}
      />
    </LaptopFrame>
  )
}

// The newest received time among the exports the plan uses.
function latestReceivedAt(received: readonly { barangay: string; epiWeek: string; seq: number; receivedAt: string }[], plan: MunicipalPlan): string | null {
  const used = new Set(plan.rows.map((row) => `${row.barangay}:${row.epiWeek}:${row.seq}`))
  const times = received.filter((item) => used.has(`${item.barangay}:${item.epiWeek}:${item.seq}`)).map((item) => item.receivedAt)
  return times.length ? times.reduce((a, b) => (a > b ? a : b)) : null
}

// Where the plan's inputs came from (19f): the reports in, and the newest one.
export type PlanBasis = { received: number; expected: number; latestAt: string | null }

// 19f: the plan as a rule trace. Each step is a node on a rail with its rule's
// reason. The rail draws and the steps rise only when a new report changed the
// plan since this laptop last showed it (animate); otherwise nothing moves.
export function PlanSteps({ plan, basis, animate = false }: { plan: MunicipalPlan; basis?: PlanBasis; animate?: boolean }) {
  const steps = planSteps(plan)
  return (
    <section aria-labelledby="plan-heading">
      <h2 id="plan-heading" className={styles.heading}>
        The plan
      </h2>
      <p className={styles.lead}>
        {basis
          ? [
              `Made by fixed rules from ${basis.received} of ${basis.expected} reports`,
              basis.latestAt ? `updated ${clockTime(new Date(basis.latestAt))}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'Made by fixed rules from the counts. Always available, with or without the AI.'}
      </p>
      <ol className={cx(styles.steps, animate && styles.drawRail)}>
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={cx(styles.step, animate && 'rise')}
            style={animate ? { animationDelay: `calc(${i} * var(--stagger))` } : undefined}
          >
            <span className={styles.stepNumber} aria-hidden>
              {i + 1}
            </span>
            <div>
              <span className="visually-hidden">{i + 1}. </span>
              <p className={styles.stepTitle}>{step.title}</p>
              {step.reason && (
                <p className={styles.stepReason}>
                  <strong className={styles.why}>Why:</strong> {step.reason}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className={styles.dose}>
        <InfoIcon size={18} weight="bold" aria-hidden />
        No doses. Doxycycline is given only after consultation with a health professional (DOH guideline).
      </p>
    </section>
  )
}

// The slot for B6's optional on-device AI panel. It gets the structured plan
// and the template text, hands back its draft with onUse, and shows the
// officer's wording box (children) inside its card; the plan is complete and
// approvable without it.
export type WordingPanel = ComponentType<{
  plan: MunicipalPlan
  draft: string
  onUse: (text: string) => void
  children?: ReactNode
}>

// The steps, the wording (the AI's draft once the officer takes it, or their
// own words, or none), and Approve.
export function PlanBody({
  plan,
  wordingPanel: Wording,
  basis,
  basisKey,
}: {
  plan: MunicipalPlan
  wordingPanel?: WordingPanel
  basis?: PlanBasis
  // The received exports behind the plan; the rail draws when they changed.
  basisKey?: string
}) {
  const [animateSteps] = useState(() => basisKey !== undefined && planChangedSinceShown(basisKey))
  useEffect(() => {
    if (basisKey !== undefined) rememberPlanShown(basisKey)
  }, [basisKey])
  const toast = useToast()
  const draft = useMemo(() => planTemplateText(plan, DEMO_MUNICIPALITY.name), [plan])
  const reference = useMemo(() => `${draft}\n${planStepsText(plan)}`, [draft, plan])
  const [text, setText] = useState('')
  // The AI draft the text started from, if it did.
  const [aiDraft, setAiDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // 19g: the approval just written (its log id and time); the plan and the
  // wording are read-only from then on.
  const [approved, setApproved] = useState<{ id: string; at: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // A new deploy waits while the officer has unapproved text in the editor.
  useHoldReload(text !== '' && approved === null)
  // 19e: a number the plan doesn't have keeps Approve off until it's fixed
  // or the draft is written again.
  const mismatch = useMemo(() => checkNumbers(text, reference).mismatched.length > 0, [text, reference])

  function takeDraft(wording: string) {
    // Approved wording is read-only.
    if (approved) return
    setText(wording)
    setAiDraft(wording)
  }

  async function onApprove() {
    setSaving(true)
    setProblem(null)
    try {
      const now = new Date()
      const id = await approvePlan(await getDb(), {
        plan,
        draftText: aiDraft ?? '',
        draftSource: aiDraft !== null ? 'llm' : 'template',
        finalText: text,
        now,
      })
      setApproved({ id, at: now.toISOString() })
      toast({ message: 'Plan approved and saved to the log.' })
    } catch {
      setProblem("Couldn't save the approval on this laptop. Nothing was lost. Try again.")
    } finally {
      setSaving(false)
    }
  }

  // The one check line is the box's own, under the text. Until an AI draft
  // fills it, the box has its label, "Wording (optional)" (19d).
  const box =
    aiDraft === null ? (
      <Field label="Wording" optional>
        {(input) => <CheckedWording id={input.id} value={text} onChange={setText} reference={reference} readOnly={!!approved} />}
      </Field>
    ) : (
      <CheckedWording value={text} onChange={setText} reference={reference} readOnly={!!approved} />
    )
  return (
    <>
      <div className={styles.columns}>
        <PlanSteps plan={plan} basis={basis} animate={animateSteps} />
        <div className={styles.wording}>
          {Wording ? (
            <Wording plan={plan} draft={draft} onUse={takeDraft}>
              {box}
            </Wording>
          ) : (
            box
          )}
        </div>
      </div>
      {approved ? (
        // 19g: the approve bar turns into the approval, in place.
        <section className={cx(styles.approved, 'rise')} aria-labelledby="approved-heading">
          <SealCheckIcon size={32} weight="bold" className={cx(styles.seal, 'stamp')} aria-hidden />
          <div className={styles.approvedText}>
            <h2 id="approved-heading" className={styles.approvedTitle}>
              Approved
            </h2>
            <p className={styles.approvedBy}>
              By the {APPROVER} · {dateTime(approved.at)}
            </p>
            <p className={styles.approvedNote}>Saved to the approval log on this laptop.</p>
          </div>
          <div className={styles.approvedActions}>
            <ButtonLink to="/municipal/log" variant="text">
              Open the approval log
            </ButtonLink>
            <div className={styles.approve}>
              <ButtonLink
                to={`/municipal/return?approval=${encodeURIComponent(approved.id)}`}
                icon={<QrCodeIcon size={22} weight="bold" aria-hidden />}
              >
                Make return QR
              </ButtonLink>
            </div>
          </div>
        </section>
      ) : (
        <div className={styles.approveBar}>
          {/* The wording is words only: what goes back to the barangays is the
              plan's own actions (the return QR reads the stored plan). */}
          <p className={styles.sends}>
            <strong>Approving sends:</strong> {planShortSummary(plan)} The wording above is not part of the return QR.
          </p>
          {problem && (
            <p role="alert" className={styles.problem}>
              <WarningCircleIcon size={18} weight="bold" aria-hidden />
              {problem}
            </p>
          )}
          <div className={styles.approver}>
            <Field label="Approved by" trailingIcon={<CaretDownIcon size={20} weight="bold" />}>
              {(input) => (
                <select {...input} defaultValue={APPROVER}>
                  <option value={APPROVER}>{APPROVER}</option>
                </select>
              )}
            </Field>
          </div>
          {mismatch && <p className={styles.approveHint}>Fix the number to approve.</p>}
          <div className={styles.approve}>
            <Button
              icon={
                saving ? (
                  <CircleNotchIcon className="spin" size={22} weight="bold" aria-hidden />
                ) : (
                  <CheckIcon size={22} weight="bold" aria-hidden />
                )
              }
              onClick={() => void onApprove()}
              disabled={saving || mismatch}
            >
              {saving ? 'Approving…' : 'Approve plan'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

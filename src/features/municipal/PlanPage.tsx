import { CheckIcon, InfoIcon, ListNumbersIcon, ScanIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useMemo, useState, type ComponentType } from 'react'
import { Button, ButtonLink, Field, StateBlock, useToast } from '../../components'
import { getDb } from '../../data/db/appDb'
import { DEMO_MUNICIPALITY } from '../../data/places'
import { useHoldReload } from '../../lib/useHoldReload'
import { useDbQuery } from '../../data/db/useDbQuery'
import { planTemplateText, type MunicipalPlan } from '../../rules/plan'
import { CheckedWording } from './CheckedWording'
import { barangayCodes } from './counts'
import { LaptopFrame } from './LaptopFrame'
import { LlmWordingPanel } from './llm'
import { APPROVER, approvePlan, readMunicipalScreen } from './municipal'
import { useLaptopPlace } from './place'
import styles from './PlanPage.module.css'
import { planSteps, planStepsText } from './steps'

// Screen 19a: the rule-based plan on the left (always there, with or without
// the AI), the optional on-device AI's draft wording on the right, checked
// number by number against the plan, and Approve. The approver is a role,
// never a name. Never a dose.

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
    // NEEDS DESIGN (TASKS.md B5-UI): the plan with no barangay QR yet.
    return (
      <LaptopFrame active="plan" title="Plan">
        <StateBlock icon={ListNumbersIcon} title="No barangay QR codes yet">
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
      <PlanBody key={basis} plan={plan} wordingPanel={LlmWordingPanel} />
    </LaptopFrame>
  )
}

export function PlanSteps({ plan }: { plan: MunicipalPlan }) {
  return (
    <section aria-labelledby="plan-heading">
      <h2 id="plan-heading" className={styles.heading}>
        The plan
      </h2>
      <p className={styles.lead}>Made by fixed rules from the counts. Always available, with or without the AI.</p>
      <ol className={styles.steps}>
        {planSteps(plan).map((step, i) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.stepNumber}>{i + 1}.</span>
            <div>
              <p className={styles.stepTitle}>{step.title}</p>
              {step.reason && <p className={styles.stepReason}>{step.reason}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className={styles.dose}>
        <InfoIcon size={18} weight="bold" aria-hidden />
        No doses. Doxycycline is given only after consultation with a health professional (DOH).
      </p>
    </section>
  )
}

// The slot for B6's optional on-device AI panel. It gets the structured plan
// and the template text, and hands back its draft with onUse; the plan is
// complete and approvable without it.
export type WordingPanel = ComponentType<{ plan: MunicipalPlan; draft: string; onUse: (text: string) => void }>

// The steps, the wording (the AI's draft once the officer takes it, or their
// own words, or none), and Approve.
export function PlanBody({ plan, wordingPanel: Wording }: { plan: MunicipalPlan; wordingPanel?: WordingPanel }) {
  const toast = useToast()
  const draft = useMemo(() => planTemplateText(plan, DEMO_MUNICIPALITY.name), [plan])
  const reference = useMemo(() => `${draft}\n${planStepsText(plan)}`, [draft, plan])
  const [text, setText] = useState('')
  // The AI draft the text started from, if it did.
  const [aiDraft, setAiDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [approvedText, setApprovedText] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // A new deploy waits while the officer has unapproved text in the editor.
  useHoldReload(text !== '' && approvedText === null)

  function takeDraft(wording: string) {
    setText(wording)
    setAiDraft(wording)
  }

  async function onApprove() {
    setSaving(true)
    setProblem(null)
    try {
      await approvePlan(await getDb(), {
        plan,
        draftText: aiDraft ?? '',
        draftSource: aiDraft !== null ? 'llm' : 'template',
        finalText: text,
      })
      setApprovedText(text)
      toast({ message: 'Plan approved and saved to the log.' })
    } catch {
      setProblem("Couldn't save the approval on this laptop. Nothing was lost. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={styles.columns}>
        <PlanSteps plan={plan} />
        <div className={styles.wording}>
          {Wording && <Wording plan={plan} draft={draft} onUse={takeDraft} />}
          <CheckedWording value={text} onChange={setText} reference={reference} placeholder="Write the wording (optional)" />
        </div>
      </div>
      <div className={styles.approveBar}>
        {problem && (
          <p role="alert" className={styles.problem}>
            <WarningCircleIcon size={18} weight="bold" aria-hidden />
            {problem}
          </p>
        )}
        <div className={styles.approver}>
          <Field label="Approved by">
            {(input) => (
              <select {...input} defaultValue={APPROVER}>
                <option value={APPROVER}>{APPROVER}</option>
              </select>
            )}
          </Field>
        </div>
        <div className={styles.approve}>
          <Button
            icon={<CheckIcon size={22} weight="bold" aria-hidden />}
            onClick={() => void onApprove()}
            disabled={saving || approvedText === text}
          >
            Approve plan
          </Button>
        </div>
      </div>
    </>
  )
}

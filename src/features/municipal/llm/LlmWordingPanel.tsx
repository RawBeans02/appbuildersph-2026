import { ArrowClockwiseIcon, CircleNotchIcon, InfoIcon, LaptopIcon, WarningIcon } from '@phosphor-icons/react'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, Progress } from '../../../components'
import { DEMO_BARANGAYS } from '../../../data/places'
import { checkWebGPU } from '../../../lib/capabilities'
import type { MunicipalPlan } from '../../../rules/plan'
import { withPlanNotes, withReminder } from './check'
import { loadWordingEngine } from './llmEngine'
import { WORDING_MODEL_NAME } from './model'
import { createWording, type Wording } from './wording'
import styles from './LlmWordingPanel.module.css'

// Screen 19's AI card (19a done, 19b downloading, 19c drafting, 19d off): an
// optional local model rewords the rule-based plan. The officer's wording box
// sits inside the card (children). A draft that passes the check (no new
// number, every move and priority in place) goes straight into that box with
// the fixed no-dose reminder; one that doesn't is never handed over, and the
// reasons show. The plan and Approve work without any of it.

let shared: Wording | null = null

function getWording(): Wording {
  shared ??= createWording({
    gpu: () => checkWebGPU(),
    loadEngine: async (onProgress, signal) => {
      const gpu = await checkWebGPU()
      signal.throwIfAborted()
      if (gpu.status !== 'available') throw new Error('No usable WebGPU on this laptop.')
      return loadWordingEngine({ kind: 'webgpu', f16: gpu.shaderF16, reason: 'AI wording on WebGPU' }, onProgress, signal)
    },
  })
  return shared
}

const KNOWN_NAMES = DEMO_BARANGAYS.map((place) => place.name)

export type LlmWordingPanelProps = {
  plan: MunicipalPlan
  // The rule-based template text the model rewords.
  draft: string
  // Gets the checked draft, with the no-dose reminder.
  onUse: (text: string) => void
  // The officer's wording box, shown inside the card except while writing.
  children?: ReactNode
}

export function LlmWordingPanel({ plan, draft, onUse, children }: LlmWordingPanelProps) {
  const [wording] = useState(getWording)
  const state = useSyncExternalStore(wording.subscribe, wording.getState, wording.getState)
  // 19h: with no writing AI, the officer's box opens only when asked for.
  const [writeOwn, setWriteOwn] = useState(false)

  useEffect(() => {
    if (wording.getState().status === 'checking') void wording.checkAvailable()
  }, [wording])

  async function write() {
    await wording.draft(draft, plan, KNOWN_NAMES)
    const after = wording.getState()
    if (after.status === 'done' && after.template === draft && after.check.ok) onUse(withReminder(withPlanNotes(after.text, draft)))
  }
  const writeAgain = (
    <div className={styles.again}>
      <Button variant="text" icon={<ArrowClockwiseIcon size={16} weight="bold" aria-hidden />} onClick={() => void write()}>
        Write it again
      </Button>
    </div>
  )
  const stale = (state.status === 'done' || state.status === 'drafting') && state.template !== draft

  // `top` above the officer's box, `bottom` under it.
  let top: ReactNode
  let bottom: ReactNode = null
  let showBox = true
  if (state.status === 'checking') {
    top = <p className={styles.body}>Checking this laptop…</p>
  } else if (state.status === 'unavailable') {
    // 19h: the panel collapses to one row; the plan is complete without it.
    return (
      <section className={styles.panel} aria-label="Wording (optional)">
        <div className={styles.offRow}>
          <p className={styles.offText}>
            <InfoIcon size={20} weight="bold" aria-hidden />
            Wording is optional. The plan on the left is complete.
          </p>
          {!writeOwn && (
            <Button variant="text" onClick={() => setWriteOwn(true)}>
              Write the wording yourself
            </Button>
          )}
        </div>
        {writeOwn && children && <div className={styles.slot}>{children}</div>}
      </section>
    )
  } else if (stale) {
    top = (
      <>
        <p className={styles.stateTitle}>The plan changed since this draft</p>
        <p className={styles.body}>Write the wording again from the new plan.</p>
      </>
    )
    bottom = writeAgain
  } else if (state.status === 'downloading' || state.status === 'loading') {
    top = (
      <>
        <p className={styles.stateTitle}>{state.status === 'downloading' ? 'Downloading the writing AI' : 'Loading the writing AI'}</p>
        <p className={styles.body}>For offline use, all required model files must remain cached in this browser.</p>
        <div className={styles.progress}>
          <Progress
            value={state.status === 'downloading' ? state.progress : null}
            label={WORDING_MODEL_NAME}
            detail={
              state.status === 'downloading'
                ? `${state.fetchedMB !== null ? `${Math.round(state.fetchedMB)} MB · ` : ''}${Math.round(state.progress * 100)}%`
                : undefined
            }
          />
        </div>
        <p className={styles.info}>
          <InfoIcon size={20} weight="bold" aria-hidden />
          The plan on the left works without it. You can approve now and skip the wording.
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={wording.cancel}>
            Cancel the download
          </Button>
        </div>
      </>
    )
  } else if (state.status === 'drafting') {
    showBox = false
    top = (
      <>
        <p className={styles.device}>
          <LaptopIcon size={16} weight="bold" aria-hidden />
          Writing on this laptop
        </p>
        <div className={`${styles.box} ${styles.streaming}`} aria-live="polite">
          {state.text}
          <span className={`${styles.cursor} blink`} aria-hidden />
        </div>
        <p className={styles.status} role="status">
          <CircleNotchIcon className="spin" size={18} weight="bold" aria-hidden />
          Writing from the plan's numbers…
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={wording.cancel}>
            Stop
          </Button>
        </div>
      </>
    )
  } else if (state.status === 'done') {
    top = (
      <>
        <p className={styles.device}>
          <LaptopIcon size={16} weight="bold" aria-hidden />
          Written on this laptop · {WORDING_MODEL_NAME} · {(state.ms / 1000).toFixed(1)} s
        </p>
        {!state.check.ok && (
          <div role="alert">
            <p className={styles.checkWarn}>
              <WarningIcon size={18} weight="bold" aria-hidden />
              The draft didn't match the plan, so it wasn't used
            </p>
            <ul className={styles.reasons}>
              {state.check.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className={styles.body}>The same plan gives the same draft. Approve the plan as listed, or write the wording yourself.</p>
          </div>
        )}
      </>
    )
    // The model writes at temperature 0: writing again from the same plan
    // repeats a rejected draft, so only an accepted one offers it.
    bottom = state.check.ok ? writeAgain : null
  } else if (state.status === 'error') {
    top = (
      <>
        <p className={styles.stateTitle}>The writing AI didn't finish</p>
        <p className={styles.body}>{state.message} The plan still works: approve it as listed, or write the wording yourself.</p>
      </>
    )
    bottom = writeAgain
  } else {
    top = (
      <>
        <p className={styles.body}>
          Optional: the on-device AI writes a short action summary from the rule-based plan. Check each draft against the full plan before approving.
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void write()}>
            Write the wording with AI
          </Button>
        </div>
      </>
    )
  }

  return (
    <section className={styles.panel} aria-labelledby="ai-wording">
      <h2 id="ai-wording" className={styles.title}>
        Draft wording by the on-device AI: check before approving
      </h2>
      {top}
      {showBox && children && <div className={styles.slot}>{children}</div>}
      {bottom}
    </section>
  )
}

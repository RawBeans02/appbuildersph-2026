import { ArrowClockwiseIcon, CheckCircleIcon, CircleNotchIcon, InfoIcon, LaptopIcon, WarningIcon } from '@phosphor-icons/react'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, Progress } from '../../../components'
import { DEMO_BARANGAYS } from '../../../data/places'
import { checkWebGPU } from '../../../lib/capabilities'
import type { MunicipalPlan } from '../../../rules/plan'
import { checkDraft, numbersIn, withReminder } from './check'
import { loadWordingEngine } from './llmEngine'
import { WORDING_MODEL_NAME } from './model'
import { createWording, type Wording } from './wording'
import styles from './LlmWordingPanel.module.css'

// Screen 19's AI panel (19a done, 19b downloading, 19c drafting, 19d off): an
// optional local model rewords the rule-based plan. The plan and Approve work
// without it. A draft that changes a number, a move or the priority order is
// never offered, and the fixed no-dose reminder is added to every draft used.

let shared: Wording | null = null

function getWording(): Wording {
  shared ??= createWording({
    gpu: () => checkWebGPU(),
    loadEngine: async (onProgress) => {
      const gpu = await checkWebGPU()
      if (gpu.status !== 'available') throw new Error('No usable WebGPU on this laptop.')
      return loadWordingEngine({ kind: 'webgpu', f16: gpu.shaderF16, reason: 'AI wording on WebGPU' }, onProgress)
    },
  })
  return shared
}

const KNOWN_NAMES = DEMO_BARANGAYS.map((place) => place.name)
const NUMBER_TOKEN = /<\s*5|\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+)?/g

// The draft with each number marked: tinted when it's one of the plan's,
// outlined with an icon when it isn't (never color alone).
function markNumbers(text: string, template: string): ReactNode[] {
  const allowed = numbersIn(template)
  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const token = match[0]
    const at = match.index ?? 0
    out.push(text.slice(last, at))
    const found = numbersIn(token)
    const ok = found.numbers.every((n) => allowed.numbers.includes(n)) && (found.smallCells === 0 || allowed.smallCells > 0)
    out.push(
      ok ? (
        <span key={at} className={styles.match}>
          {token}
        </span>
      ) : (
        <span key={at} className={styles.mismatch}>
          <WarningIcon size={14} weight="bold" aria-label="doesn't match the plan" />
          {token}
        </span>
      ),
    )
    last = at + token.length
  }
  out.push(text.slice(last))
  return out
}

export type LlmWordingPanelProps = {
  plan: MunicipalPlan
  // The rule-based template text the model rewords.
  draft: string
  onUse: (text: string) => void
}

export function LlmWordingPanel({ plan, draft, onUse }: LlmWordingPanelProps) {
  const [wording] = useState(getWording)
  const state = useSyncExternalStore(wording.subscribe, wording.getState, wording.getState)
  const [useError, setUseError] = useState<string[] | null>(null)

  useEffect(() => {
    if (wording.getState().status === 'checking') void wording.checkAvailable()
  }, [wording])

  const write = () => {
    setUseError(null)
    void wording.draft(draft, plan, KNOWN_NAMES)
  }
  const writeAgain = (
    <Button variant="text" icon={<ArrowClockwiseIcon size={16} weight="bold" aria-hidden />} onClick={write}>
      Write it again
    </Button>
  )
  const stale = (state.status === 'done' || state.status === 'drafting') && state.template !== draft

  function applyDraft(text: string) {
    // The plan may have changed since the draft was checked: check again now.
    const check = checkDraft(text, draft, plan, KNOWN_NAMES)
    if (check.ok) onUse(withReminder(text))
    else setUseError(check.reasons)
  }

  let content: ReactNode
  if (state.status === 'checking') {
    content = <p className={styles.body}>Checking this laptop…</p>
  } else if (state.status === 'unavailable') {
    content = (
      <>
        <p className={styles.stateTitle}>The writing AI is off on this laptop</p>
        <p className={styles.body}>This laptop can't run it. The plan still works: approve it as listed, or write the wording yourself.</p>
      </>
    )
  } else if (stale) {
    content = (
      <>
        <p className={styles.stateTitle}>The plan changed since this draft</p>
        <p className={styles.body}>Write the wording again from the new plan.</p>
        <div className={styles.actions}>{writeAgain}</div>
      </>
    )
  } else if (state.status === 'downloading' || state.status === 'loading') {
    content = (
      <>
        <p className={styles.stateTitle}>{state.status === 'downloading' ? 'Downloading the writing AI' : 'Loading the writing AI'}</p>
        <p className={styles.body}>First time only. After this it runs on this laptop with no internet.</p>
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
    content = (
      <>
        <p className={styles.device}>
          <LaptopIcon size={16} weight="bold" aria-hidden />
          Writing on this laptop
        </p>
        <div className={`${styles.box} ${styles.streaming}`} aria-live="polite">
          {state.text}
          <span className={styles.cursor} aria-hidden />
        </div>
        <p className={styles.status} role="status">
          <CircleNotchIcon size={18} weight="bold" aria-hidden />
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
    const reasons = useError ?? (state.check.ok ? null : state.check.reasons)
    content = (
      <>
        <p className={styles.device}>
          <LaptopIcon size={16} weight="bold" aria-hidden />
          Written on this laptop · {WORDING_MODEL_NAME} · {(state.ms / 1000).toFixed(1)} s
        </p>
        <div className={styles.box}>{markNumbers(state.text, state.template)}</div>
        <div className={styles.checkRow}>
          {reasons ? (
            <span className={styles.checkWarn}>
              <WarningIcon size={18} weight="bold" aria-hidden />
              The draft doesn't match the plan, so the plan's wording stays
            </span>
          ) : (
            <span className={styles.checkOk}>
              <CheckCircleIcon size={18} weight="bold" aria-hidden />
              No new numbers found; check each number against the table above
            </span>
          )}
          {writeAgain}
        </div>
        {reasons && (
          <ul className={styles.reasons}>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {!reasons && (
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => applyDraft(state.text)}>
              Use this wording
            </Button>
          </div>
        )}
      </>
    )
  } else if (state.status === 'error') {
    content = (
      <>
        <p className={styles.stateTitle}>The writing AI didn't finish</p>
        <p className={styles.body}>{state.message} The plan still works: approve it as listed, or write the wording yourself.</p>
        <div className={styles.actions}>{writeAgain}</div>
      </>
    )
  } else {
    content = (
      <>
        <p className={styles.body}>
          A small language model on this laptop can reword the plan. It may not change any number, and you still check and approve.
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={write}>
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
      {content}
    </section>
  )
}

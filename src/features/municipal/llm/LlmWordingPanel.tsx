import { useEffect, useState, useSyncExternalStore } from 'react'
import { DEMO_BARANGAYS } from '../../../data/places'
import { checkWebGPU } from '../../../lib/capabilities'
import type { MunicipalPlan } from '../../../rules/plan'
import { loadWordingEngine } from './llmEngine'
import { createWording, type Wording } from './wording'

// Screen 19's AI panel: an optional local model rewords the rule-based plan.
// The officer edits and approves either way; a draft that changes a number,
// adds a dose or a barangay, or reorders priorities is never offered.
// Plain until design/ lands. NEEDS DESIGN: screen 19's AI panel.

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

export type LlmWordingPanelProps = {
  plan: MunicipalPlan
  // The rule-based template text the model rewords.
  draft: string
  onUse: (text: string) => void
}

export function LlmWordingPanel({ plan, draft, onUse }: LlmWordingPanelProps) {
  const [wording] = useState(getWording)
  const state = useSyncExternalStore(wording.subscribe, wording.getState, wording.getState)

  useEffect(() => {
    if (wording.getState().status === 'checking') void wording.checkAvailable()
  }, [wording])

  const names = { priority: plan.priority.map((entry) => entry.name), known: DEMO_BARANGAYS.map((place) => place.name) }

  return (
    <section aria-label="AI wording (optional)">
      <h2>AI wording (optional, runs on this laptop)</h2>
      {state.status === 'checking' && <p>Checking this laptop…</p>}
      {state.status === 'unavailable' && <p>{state.reason}</p>}
      {state.status === 'idle' && (
        <>
          <p>A small language model can reword the plan above. It may not change any number, and you still edit and approve.</p>
          <button type="button" onClick={() => void wording.draft(draft, names)}>
            Draft the wording with AI
          </button>
        </>
      )}
      {state.status === 'downloading' && (
        <p role="status">
          Downloading the model once ({Math.round(state.progress * 100)}%
          {state.fetchedMB !== null ? `, ${Math.round(state.fetchedMB)} MB so far` : ''})…
          <br />
          <progress max={1} value={state.progress} aria-label="Model download progress" />
        </p>
      )}
      {state.status === 'loading' && <p role="status">Loading the model on this laptop's GPU…</p>}
      {state.status === 'drafting' && (
        <>
          <p role="status">Drafting on this laptop…</p>
          <p>{state.text}</p>
          <button type="button" onClick={wording.cancel}>
            Stop
          </button>
        </>
      )}
      {state.status === 'done' &&
        (state.check.ok ? (
          <>
            <p>
              AI draft ({(state.ms / 1000).toFixed(1)} s on this laptop). Every number matches the plan:
            </p>
            <blockquote>{state.text}</blockquote>
            <button type="button" onClick={() => onUse(state.text)}>
              Use this wording
            </button>{' '}
            <button type="button" onClick={() => void wording.draft(draft, names)}>
              Try again
            </button>
          </>
        ) : (
          <>
            <p role="alert">The AI draft was not used, so the template wording stays. Why:</p>
            <ul>
              {state.check.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <button type="button" onClick={() => void wording.draft(draft, names)}>
              Try again
            </button>
          </>
        ))}
      {state.status === 'error' && (
        <p role="alert">
          The AI wording is not available right now ({state.message}). The template wording stays.{' '}
          <button type="button" onClick={() => void wording.draft(draft, names)}>
            Try again
          </button>
        </p>
      )}
    </section>
  )
}

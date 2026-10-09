import type { WebGPUSupport } from '../../../lib/capabilities'
import { checkDraft, type DraftCheck, type PlanFacts } from './check'
import { buildMessages, MAX_DRAFT_TOKENS, type ChatMessage } from './prompt'

// The AI panel's states (screen 19): the optional local model rewords the
// rule-based plan. Without a usable WebGPU it's unavailable and the officer
// works from the template, which is always there. Pure logic with injected
// dependencies; the WebLLM adapter is in engine.ts.

export type LoadProgress = { progress: number; fetchedMB: number | null }

export type LlmEngine = {
  dispose?(): void
  complete(
    messages: ChatMessage[],
    options: { maxTokens: number; signal: AbortSignal; onText: (textSoFar: string) => void },
  ): Promise<string>
}

export type WordingDeps = {
  gpu(): Promise<WebGPUSupport>
  loadEngine(onProgress: (progress: LoadProgress) => void, signal: AbortSignal): Promise<LlmEngine>
  now?: () => number
}

export type WordingState =
  | { status: 'checking' }
  | { status: 'unavailable'; reason: string }
  | { status: 'idle' }
  | { status: 'downloading'; progress: number; fetchedMB: number | null }
  | { status: 'loading' }
  // template: the plan text the draft rewords, to tell when the plan changed.
  | { status: 'drafting'; text: string; template: string }
  | { status: 'done'; text: string; check: DraftCheck; ms: number; template: string }
  | { status: 'error'; message: string }

export const DRAFT_TIMEOUT_MS = 90_000

export function createWording(deps: WordingDeps) {
  const now = deps.now ?? (() => performance.now())
  let state: WordingState = { status: 'checking' }
  let engine: Promise<LlmEngine> | null = null
  let controller: AbortController | null = null
  const listeners = new Set<() => void>()
  const setState = (next: WordingState) => {
    state = next
    listeners.forEach((listener) => listener())
  }

  async function checkAvailable() {
    const gpu = await deps.gpu().catch(() => ({ status: 'unsupported' }) as WebGPUSupport)
    if (gpu.status !== 'available') {
      setState({ status: 'unavailable', reason: 'This laptop has no usable WebGPU, so the plan uses the template wording.' })
    } else if (gpu.isFallbackAdapter) {
      setState({ status: 'unavailable', reason: 'WebGPU here runs on a software fallback, too slow for the model.' })
    } else {
      setState({ status: 'idle' })
    }
  }

  function getEngine(abort: AbortController): Promise<LlmEngine> {
    if (!engine) {
      const loading = deps.loadEngine((progress) => {
        if (controller !== abort || abort.signal.aborted) return
        if (progress.progress >= 1) setState({ status: 'loading' })
        else setState({ status: 'downloading', ...progress })
      }, abort.signal)
      engine = loading
      loading.catch(() => {
        if (engine === loading) engine = null
      })
    }
    return engine
  }

  // Settles even if a backend never resolves initialization or generation.
  function untilAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const stop = () => reject(signal.reason)
      if (signal.aborted) { stop(); return }
      signal.addEventListener('abort', stop, { once: true })
      pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop))
    })
  }

  async function draft(template: string, plan: PlanFacts, knownNames: readonly string[]) {
    if (state.status === 'unavailable' || state.status === 'checking') return
    if (['downloading', 'loading', 'drafting'].includes(state.status)) return
    const abort = new AbortController()
    controller = abort
    const timer = setTimeout(() => abort.abort(new Error('timeout')), DRAFT_TIMEOUT_MS)
    const update = (next: WordingState) => controller === abort && !abort.signal.aborted && setState(next)
    let loading: Promise<LlmEngine> | null = null
    const release = () => {
      if (engine === loading) engine = null
      // Also releases an engine which arrives after cancellation.
      void loading?.then((llm) => llm.dispose?.(), () => {})
    }
    abort.signal.addEventListener('abort', release, { once: true })
    try {
      setState({ status: 'loading' })
      loading = getEngine(abort)
      const llm = await untilAborted(loading, abort.signal)
      if (abort.signal.aborted) throw abort.signal.reason
      const started = now()
      update({ status: 'drafting', text: '', template })
      const text = await untilAborted(llm.complete(buildMessages(template), {
        maxTokens: MAX_DRAFT_TOKENS,
        signal: abort.signal,
        onText: (soFar) => update({ status: 'drafting', text: soFar, template }),
      }), abort.signal)
      if (abort.signal.aborted) throw abort.signal.reason
      update({
        status: 'done',
        text: text.trim(),
        check: checkDraft(text, template, plan, knownNames),
        ms: now() - started,
        template,
      })
    } catch (error) {
      if (controller !== abort) return
      if (abort.signal.reason instanceof Error && abort.signal.reason.message === 'timeout') {
        setState({ status: 'error', message: 'The model took too long. Use the template wording.' })
      } else if (!abort.signal.aborted) {
        release()
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      clearTimeout(timer)
      abort.signal.removeEventListener('abort', release)
      if (controller === abort) controller = null
    }
  }

  // Stops a draft in progress; the template wording stays.
  function cancel() {
    if (!controller) return
    controller.abort()
    controller = null
    setState({ status: 'idle' })
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    checkAvailable,
    draft,
    cancel,
  }
}

export type Wording = ReturnType<typeof createWording>

// "Fetching param cache[12/22]: 302MB fetched. 40% completed…": the MB WebLLM
// reports as downloaded, so the panel shows the real figure.
export function parseFetchedMB(text: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*MB fetched/i.exec(text)
  return match ? Number(match[1]) : null
}

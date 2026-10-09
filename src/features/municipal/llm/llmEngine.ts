import { createInferenceClient } from '../../../inference/client'
import type { Backend } from '../../../lib/backend'
import type { LlmEngine, LoadProgress } from './wording'

// The main-thread side: starts the AI wording's worker and turns it into the
// LlmEngine the panel's state machine uses. No WebLLM code on this side.

export async function loadWordingEngine(
  backend: Backend,
  onProgress: (progress: LoadProgress) => void,
): Promise<LlmEngine> {
  const worker = new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' })
  const client = createInferenceClient(worker)
  try {
    await client.init(backend, {
      onProgress: (progress, partial) =>
        onProgress({ progress, fetchedMB: (partial as { fetchedMB?: number | null } | undefined)?.fetchedMB ?? null }),
    })
  } catch (error) {
    client.dispose()
    throw error
  }
  return {
    complete: (messages, { maxTokens, signal, onText }) =>
      client.run<string>(
        { messages, maxTokens },
        { signal, onProgress: (_progress, partial) => typeof partial === 'string' && onText(partial) },
      ),
  }
}

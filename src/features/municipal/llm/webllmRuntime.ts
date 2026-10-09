import { CreateMLCEngine, type MLCEngine } from '@mlc-ai/web-llm'
import type { Runtime } from '../../../inference/protocol'
import { wordingModelRecord } from './model'
import { MAX_DRAFT_TOKENS, type ChatMessage } from './prompt'
import { parseFetchedMB } from './wording'

// WebLLM inside the AI wording's worker (webllm.worker.ts), behind the app's
// inference protocol, so the main thread never loads the library. WebLLM
// downloads the weights on first use and caches them itself.

export type WordingRequest = { messages: ChatMessage[]; maxTokens: number }

function isWordingRequest(value: unknown): value is WordingRequest {
  const request = value as Partial<WordingRequest> | null
  return (
    !!request &&
    Array.isArray(request.messages) &&
    request.messages.every((m) => (m.role === 'system' || m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') &&
    Number.isInteger(request.maxTokens) &&
    (request.maxTokens ?? 0) > 0
  )
}

export function createWebLlmRuntime(): Runtime<WordingRequest, string> {
  let engine: MLCEngine | null = null
  return {
    async init(backend, onProgress) {
      if (backend.kind !== 'webgpu') throw new Error('The AI wording needs WebGPU.')
      const model = wordingModelRecord(backend.f16)
      engine = await CreateMLCEngine(model.model_id, {
        appConfig: { model_list: [model], cacheBackend: 'cache' },
        initProgressCallback: (report) => onProgress(report.progress, { fetchedMB: parseFetchedMB(report.text) }),
      })
    },

    async run(input, { signal, onProgress }) {
      if (!engine) throw new Error('The model is not loaded.')
      if (!isWordingRequest(input)) throw new Error('Expected { messages, maxTokens }.')
      const llm = engine
      const interrupt = () => llm.interruptGenerate()
      signal.addEventListener('abort', interrupt)
      try {
        await llm.resetChat()
        const maxTokens = Math.min(input.maxTokens, MAX_DRAFT_TOKENS)
        const chunks = await llm.chat.completions.create({
          messages: input.messages,
          max_tokens: maxTokens,
          temperature: 0,
          stream: true,
        })
        let text = ''
        let tokens = 0
        for await (const chunk of chunks) {
          text += chunk.choices[0]?.delta?.content ?? ''
          tokens += 1
          onProgress(Math.min(1, tokens / maxTokens), text)
        }
        signal.throwIfAborted()
        return text
      } finally {
        signal.removeEventListener('abort', interrupt)
      }
    },
  }
}

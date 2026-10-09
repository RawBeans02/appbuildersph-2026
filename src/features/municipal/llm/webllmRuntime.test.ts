import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateMLCEngine, type MLCEngine } from '@mlc-ai/web-llm'
import { WORDING_MODEL_RECORDS } from './model'
import { createWebLlmRuntime } from './webllmRuntime'
import { MAX_DRAFT_TOKENS } from './prompt'

vi.mock('@mlc-ai/web-llm', () => ({ CreateMLCEngine: vi.fn() }))

const createEngine = vi.mocked(CreateMLCEngine)
beforeEach(() => createEngine.mockReset())

describe('WebLLM model configuration', () => {
  it('accepts few-shot assistant messages and caps deterministic generation', async () => {
    const complete = vi.fn(async function* () {
      yield { choices: [{ delta: { content: 'The faithful draft.' } }] }
    })
    createEngine.mockResolvedValue({
      resetChat: vi.fn(async () => {}),
      interruptGenerate: vi.fn(),
      chat: { completions: { create: complete } },
    } as unknown as MLCEngine)
    const runtime = createWebLlmRuntime()
    await runtime.init({ kind: 'webgpu', f16: true, reason: 'test' }, () => {})
    const messages = [
      { role: 'user' as const, content: 'Sample' },
      { role: 'assistant' as const, content: 'Sample answer' },
      { role: 'user' as const, content: 'Actual plan' },
    ]
    await expect(runtime.run({ messages, maxTokens: 9999 }, {
      signal: new AbortController().signal,
      onProgress: () => {},
    })).resolves.toBe('The faithful draft.')
    expect(complete).toHaveBeenCalledWith({ messages, max_tokens: MAX_DRAFT_TOKENS, temperature: 0, stream: true })
  })
  it.each([
    [true, WORDING_MODEL_RECORDS.f16],
    [false, WORDING_MODEL_RECORDS.f32],
  ])('loads the shared %s record through WebLLM Cache API storage', async (shaderF16, model) => {
    createEngine.mockResolvedValue({} as MLCEngine)
    const runtime = createWebLlmRuntime()
    const progress = vi.fn()

    await runtime.init({ kind: 'webgpu', f16: shaderF16, reason: 'test' }, progress)

    expect(createEngine).toHaveBeenCalledWith(
      model.model_id,
      expect.objectContaining({
        appConfig: { model_list: [model], cacheBackend: 'cache' },
        initProgressCallback: expect.any(Function),
      }),
    )
    expect(createEngine).toHaveBeenCalledOnce()
  })
})

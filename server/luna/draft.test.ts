import { describe, expect, it, vi } from 'vitest'
import { scenarioPayloads } from '../test/lunaScenario.js'
import { DRAFT_LIMITS, OPENAI_CHAT_URL, requestWording, SYSTEM_PROMPT, type Fetcher } from './draft.js'
import { alertCandidates } from './facts.js'

// OpenAI is mocked everywhere: these tests never reach the network.

const candidate = alertCandidates(scenarioPayloads())[0]

const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), { status: 200 })
const status = (code: number, body: unknown = { error: { message: 'x' } }) => new Response(JSON.stringify(body), { status: code })

function mockFetch(...answers: (Response | Error | 'hang')[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetcher: Fetcher = (url, init) => {
    calls.push({ url, init: init! })
    const answer = answers[calls.length - 1] ?? answers.at(-1)!
    if (answer === 'hang') {
      return new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)))
    }
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer.clone())
  }
  return { fetcher, calls, body: (i: number) => JSON.parse(String(calls[i].init.body)) as Record<string, unknown> }
}

const base = (fetcher: Fetcher, takeCall = async () => true) => {
  const sleep = vi.fn(async () => undefined)
  return { options: { apiKey: 'test-key-not-real', model: 'gpt-6-luna', takeCall, fetch: fetcher, sleep }, sleep }
}

describe('requestWording (GPT-6 Luna, mocked)', () => {
  it('sends only the kind, the facts and the template, with the limits', async () => {
    const mock = mockFetch(reply('  The wording.  '))
    const { options } = base(mock.fetcher)
    expect(await requestWording(candidate, options)).toEqual({ ok: true, text: 'The wording.', attempts: 1 })
    expect(mock.calls[0].url).toBe(OPENAI_CHAT_URL)
    expect((mock.calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer test-key-not-real')
    const body = mock.body(0)
    expect(body).toMatchObject({ model: 'gpt-6-luna', max_completion_tokens: 200, temperature: 0.2, reasoning_effort: 'none' })
    const messages = body.messages as { role: string; content: string }[]
    expect(messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    expect(Object.keys(JSON.parse(messages[1].content))).toEqual(['kind', 'facts', 'template'])
    expect(JSON.parse(messages[1].content).template).toBe(candidate.templateText)
    expect(SYSTEM_PROMPT).toMatch(/no other number/i)
    expect(SYSTEM_PROMPT).toMatch(/no dose/i)
    expect(SYSTEM_PROMPT).toMatch(/no person/i)
    expect(SYSTEM_PROMPT).toMatch(/diagnosis/i)
    expect(SYSTEM_PROMPT).toMatch(/no action/i)
  })

  it('retries at most twice on 5xx, 429 or a network error, with backoff', async () => {
    const mock = mockFetch(status(500), new TypeError('fetch failed'), reply('Third time.'))
    const { options, sleep } = base(mock.fetcher)
    expect(await requestWording(candidate, options)).toEqual({ ok: true, text: 'Third time.', attempts: 3 })
    expect(sleep.mock.calls).toEqual([[500], [1500]])

    const down = mockFetch(status(503))
    const failing = base(down.fetcher)
    expect(await requestWording(candidate, failing.options)).toEqual({ ok: false, reason: 'unreachable', attempts: 3 })
    expect(down.calls).toHaveLength(1 + DRAFT_LIMITS.retries)

    const limited = mockFetch(status(429), reply('After the limit.'))
    expect(await requestWording(candidate, base(limited.fetcher).options)).toMatchObject({ ok: true, attempts: 2 })
  })

  it('times out each try (20 s by default) and gives up after the retries', async () => {
    expect(DRAFT_LIMITS.timeoutMs).toBe(20_000)
    const mock = mockFetch('hang')
    const { options } = base(mock.fetcher)
    const outcome = await requestWording(candidate, { ...options, timeoutMs: 15 })
    expect(outcome).toEqual({ ok: false, reason: 'timeout', attempts: 3 })
    expect(mock.calls[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it("doesn't retry a refused key or a rejected request", async () => {
    const auth = mockFetch(status(401))
    expect(await requestWording(candidate, base(auth.fetcher).options)).toEqual({ ok: false, reason: 'auth', attempts: 1 })
    const bad = mockFetch(status(400, { error: { message: 'bad', param: 'messages' } }))
    expect(await requestWording(candidate, base(bad.fetcher).options)).toEqual({ ok: false, reason: 'rejected', attempts: 1 })
  })

  it('drops a parameter the model refuses, and swaps the token cap to max_tokens', async () => {
    const mock = mockFetch(
      status(400, { error: { param: 'temperature' } }),
      status(400, { error: { param: 'max_completion_tokens' } }),
      reply('Adjusted.'),
    )
    expect(await requestWording(candidate, base(mock.fetcher).options)).toEqual({ ok: true, text: 'Adjusted.', attempts: 3 })
    expect(mock.body(1)).not.toHaveProperty('temperature')
    expect(mock.body(2)).toMatchObject({ max_tokens: 200 })
    expect(mock.body(2)).not.toHaveProperty('max_completion_tokens')
  })

  it("stops when the day's limit is used up, without calling", async () => {
    const mock = mockFetch(reply('never'))
    expect(await requestWording(candidate, base(mock.fetcher, async () => false).options)).toEqual({
      ok: false,
      reason: 'daily-limit',
      attempts: 0,
    })
    expect(mock.calls).toHaveLength(0)
  })

  it('treats an empty or missing reply as a failure', async () => {
    const mock = mockFetch(new Response(JSON.stringify({ choices: [{ message: { content: null, refusal: 'no' } }] })))
    expect(await requestWording(candidate, base(mock.fetcher).options)).toEqual({ ok: false, reason: 'empty', attempts: 1 })
  })
})

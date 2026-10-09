import type { AlertCandidate } from './facts.js'

// Asks OpenAI's GPT-6 Luna (OPENAI_CHAT_MODEL) to reword one alert's
// template, server-side, through the Chat Completions endpoint. Wording only:
// the facts and the template decide everything, the reply is checked
// (check.ts), and the template is used whenever anything goes wrong.
//
// What the model gets: the alert's kind, its facts (codes, demo place names,
// an ISO week, counts as sent with "<5", ranges) and the template built from
// them. Never a record, a name of a person, or text from anywhere else.

export const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

export const DRAFT_LIMITS = {
  // Luna is a reasoning model: the cap is max_completion_tokens (max_tokens is
  // for older models), and reasoning_effort "none" leaves it to the wording.
  maxCompletionTokens: 200,
  temperature: 0.2,
  timeoutMs: 20_000,
  // At most 2 retries after the first try, on a timeout, a network error, 429
  // or 5xx, waiting 0.5 s then 1.5 s.
  retries: 2,
  backoffMs: [500, 1500],
  // No retry starts unless a full try still fits in this, so a draft request
  // ends well inside the route's 60 s (vercel.json).
  budgetMs: 45_000,
} as const

export const SYSTEM_PROMPT = [
  'You reword one public-health operations alert for a provincial or DOH health officer in the Philippines.',
  'Rewrite TEMPLATE in clear, plain English (a short Tagalog phrase is fine), in at most 70 words.',
  'Rules:',
  '- Use only the numbers, ranges and "<5" values that appear in TEMPLATE, each next to the same barangay it belongs to. Add no other number.',
  '- Keep every barangay name exactly as written. Name no other place and no person.',
  '- Add no dose, medicine amount per person, schedule, diagnosis or prescription.',
  '- Add no action, recommendation or advice that is not in TEMPLATE. A stock move keeps its from, to and amount in one sentence.',
  '- Keep "<5" as written: it means 1 to 4 people.',
  'Reply with the alert text only.',
].join('\n')

export function draftMessages(candidate: AlertCandidate): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ kind: candidate.kind, facts: candidate.facts, template: candidate.templateText }) },
  ]
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export type DraftFailure = 'daily-limit' | 'timeout' | 'unreachable' | 'auth' | 'rejected' | 'empty'

export type DraftOutcome = { ok: true; text: string; attempts: number } | { ok: false; reason: DraftFailure; attempts: number }

export type DraftOptions = {
  apiKey: string
  model: string
  // Takes one call from the day's limit; false when it's used up.
  takeCall: () => Promise<boolean>
  fetch?: Fetcher
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number
  // Milliseconds now, for the time budget (tests pass their own clock).
  clock?: () => number
}

// Parameters a model may refuse (OpenAI answers 400 naming the param): dropped,
// or for the token cap swapped to the older name, then tried again at once.
const ADJUSTABLE = new Set(['temperature', 'reasoning_effort', 'max_completion_tokens'])

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function errorParam(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { param?: unknown } }
    return typeof body.error?.param === 'string' ? body.error.param : null
  } catch {
    return null
  }
}

function replyText(body: unknown): string {
  const choice = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
  const content = choice?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

export async function requestWording(candidate: AlertCandidate, options: DraftOptions): Promise<DraftOutcome> {
  const fetcher = options.fetch ?? fetch
  const sleep = options.sleep ?? wait
  const timeoutMs = options.timeoutMs ?? DRAFT_LIMITS.timeoutMs
  const body: Record<string, unknown> = {
    model: options.model,
    messages: draftMessages(candidate),
    max_completion_tokens: DRAFT_LIMITS.maxCompletionTokens,
    reasoning_effort: 'none',
    temperature: DRAFT_LIMITS.temperature,
  }
  const clock = options.clock ?? Date.now
  const started = clock()
  let attempts = 0
  let retried = 0
  let adjusted = 0
  for (;;) {
    if (!(await options.takeCall())) return { ok: false, reason: 'daily-limit', attempts }
    attempts += 1
    let failure: DraftFailure
    try {
      const response = await fetcher(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.ok) {
        const text = replyText(await response.json().catch(() => null))
        return text ? { ok: true, text, attempts } : { ok: false, reason: 'empty', attempts }
      }
      if (response.status === 400 && adjusted < ADJUSTABLE.size) {
        const param = await errorParam(response)
        if (param && ADJUSTABLE.has(param) && param in body) {
          if (param === 'max_completion_tokens') body.max_tokens = DRAFT_LIMITS.maxCompletionTokens
          delete body[param]
          adjusted += 1
          continue
        }
      }
      if (response.status === 401 || response.status === 403) return { ok: false, reason: 'auth', attempts }
      if (response.status !== 429 && response.status < 500) return { ok: false, reason: 'rejected', attempts }
      failure = 'unreachable'
    } catch (error) {
      failure = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'unreachable'
    }
    if (retried >= DRAFT_LIMITS.retries) return { ok: false, reason: failure, attempts }
    const backoff = DRAFT_LIMITS.backoffMs[retried]
    if (clock() - started + backoff + timeoutMs > DRAFT_LIMITS.budgetMs) return { ok: false, reason: failure, attempts }
    await sleep(backoff)
    retried += 1
  }
}

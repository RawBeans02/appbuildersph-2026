import { MAX_ALERTS, type AlertCandidate } from './facts.js'

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
  // or 5xx, waiting 0.5 s then 1.5 s, while the request's calls and time last.
  retries: 2,
  backoffMs: [500, 1500],
  // No try starts unless it still fits in this, counted from the start of the
  // draft request, so it ends well inside the route's 60 s (vercel.json).
  budgetMs: 45_000,
  // OpenAI calls per draft request, in all: one billed call per alert (at most
  // MAX_ALERTS) plus one to renegotiate the parameters the model refuses.
  maxCallsPerRequest: MAX_ALERTS + 1,
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
  '- Plain characters only: straight quotes and apostrophes, hyphens, no emoji; keep "×" and "–" where TEMPLATE has them. No link, web or e-mail address.',
  'Reply with the alert text only.',
].join('\n')

export function draftMessages(candidate: AlertCandidate): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ kind: candidate.kind, facts: candidate.facts, template: candidate.templateText }) },
  ]
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

// 'call-cap': the draft request's calls (maxCallsPerRequest) were used up.
export type DraftFailure = 'daily-limit' | 'call-cap' | 'timeout' | 'unreachable' | 'auth' | 'rejected' | 'empty'

export type DraftOutcome = { ok: true; text: string; attempts: number } | { ok: false; reason: DraftFailure; attempts: number }

// One draft request's share of OpenAI, across all its alerts: the request
// parameters as negotiated so far (renegotiated at most once), the calls made
// (at most maxCalls) and when the request started (for the time budget).
export type LunaSession = {
  params: Readonly<Record<string, unknown>>
  renegotiated: boolean
  calls: number
  readonly maxCalls: number
  readonly started: number
}

const DEFAULT_PARAMS = {
  max_completion_tokens: DRAFT_LIMITS.maxCompletionTokens,
  reasoning_effort: 'none',
  temperature: DRAFT_LIMITS.temperature,
} as const

export function newSession(clock: () => number = Date.now, maxCalls: number = DRAFT_LIMITS.maxCallsPerRequest): LunaSession {
  return { params: DEFAULT_PARAMS, renegotiated: false, calls: 0, maxCalls, started: clock() }
}

export type DraftOptions = {
  apiKey: string
  model: string
  // Takes one call from the day's limit; false when it's used up.
  takeCall: () => Promise<boolean>
  // Gives it back when OpenAI answered with an error status: such a call
  // isn't billed. (A timeout or a network error may have been, so it stays.)
  refundCall?: () => Promise<void>
  // Shared by every alert of one draft request; a single call gets its own.
  session?: LunaSession
  fetch?: Fetcher
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number
  // Milliseconds now, for the time budget (tests pass their own clock).
  clock?: () => number
}

// Parameters a model may refuse (OpenAI answers 400 naming the param). The
// first refusal in a request renegotiates once for every alert after it: the
// optional temperature and reasoning_effort are both dropped, and a refused
// max_completion_tokens becomes the older max_tokens (the token cap always
// stays). A later refusal isn't renegotiated again.
const ADJUSTABLE = new Set(['temperature', 'reasoning_effort', 'max_completion_tokens'])

function renegotiate(params: Readonly<Record<string, unknown>>, refused: string): Record<string, unknown> {
  const next: Record<string, unknown> = { ...params }
  delete next.temperature
  delete next.reasoning_effort
  if (refused === 'max_completion_tokens') {
    delete next.max_completion_tokens
    next.max_tokens = DRAFT_LIMITS.maxCompletionTokens
  }
  return next
}

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
  const clock = options.clock ?? Date.now
  const session = options.session ?? newSession(clock)
  const messages = draftMessages(candidate)
  let attempts = 0
  let retried = 0
  let backoff = 0
  // Why the last try failed: what a retry that can't start reports.
  let failure: DraftFailure | null = null
  for (;;) {
    if (backoff > 0) await sleep(backoff)
    backoff = 0
    // Every try, the first included, must fit the request's time and calls.
    if (clock() - session.started + timeoutMs > DRAFT_LIMITS.budgetMs) return { ok: false, reason: failure ?? 'timeout', attempts }
    if (session.calls >= session.maxCalls) return { ok: false, reason: failure ?? 'call-cap', attempts }
    // Reserved before anything is awaited, so alerts running at the same time can't pass the cap.
    session.calls += 1
    if (!(await options.takeCall())) {
      session.calls -= 1
      return { ok: false, reason: 'daily-limit', attempts }
    }
    attempts += 1
    const params = session.params
    try {
      const response = await fetcher(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: options.model, messages, ...params }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.ok) {
        const text = replyText(await response.json().catch(() => null))
        return text ? { ok: true, text, attempts } : { ok: false, reason: 'empty', attempts }
      }
      // An error answer isn't billed: it doesn't count against the day's limit.
      await options.refundCall?.()
      if (response.status === 400) {
        const param = await errorParam(response)
        if (param && ADJUSTABLE.has(param) && param in params) {
          // Another alert of this request already renegotiated: try its parameters.
          if (session.params !== params) continue
          if (!session.renegotiated) {
            session.params = renegotiate(params, param)
            session.renegotiated = true
            continue
          }
        }
      }
      if (response.status === 401 || response.status === 403) return { ok: false, reason: 'auth', attempts }
      if (response.status !== 429 && response.status < 500) return { ok: false, reason: 'rejected', attempts }
      failure = 'unreachable'
    } catch (error) {
      failure = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'unreachable'
    }
    if (retried >= DRAFT_LIMITS.retries) return { ok: false, reason: failure, attempts }
    backoff = DRAFT_LIMITS.backoffMs[retried]
    retried += 1
    // A retry that couldn't finish in the budget doesn't start (or wait).
    if (clock() - session.started + backoff + timeoutMs > DRAFT_LIMITS.budgetMs) return { ok: false, reason: failure, attempts }
  }
}

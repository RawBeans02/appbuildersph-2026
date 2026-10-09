// The server's settings, read from the environment (set by the owner in the
// Vercel dashboard; Vercel's Neon integration injects DATABASE_URL). Values
// are never logged or returned; only whether each one is set.

// The enroll code and the view code are the only secrets a person types, and
// anyone may guess them (slowed by the rate limits): shorter than this, after
// trimming, they count as not set, so the routes that need them stay closed.
export const MIN_CODE_LENGTH = 16

export type ServerEnv = {
  databaseUrl: string | null
  // Admits a municipal laptop's key once (POST /api/enroll). Trimmed; null
  // when missing or shorter than MIN_CODE_LENGTH.
  enrollCode: string | null
  // Opens the DOH view (GET /api/reports, the alerts routes). Same rule.
  viewCode: string | null
  // A code that is set but too short (so /api/health can tell the owner).
  weakCodes: { enroll: boolean; view: boolean }
  // Phase 2 alerts (server/luna/): the optional GPT-6 Luna wording.
  openaiApiKey: string | null
  openaiModel: string
  // Kill switch: anything but "true" or "1" means template wording only.
  lunaEnabled: boolean
  // Calls to the model per day (Philippine time); missing or not a whole
  // number means 0, so the AI stays off until a limit is set.
  lunaDailyLimit: number
}

export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna'

const value = (raw: string | undefined): string | null => (raw && raw.trim() !== '' ? raw : null)

// A code setting: trimmed, and usable only at MIN_CODE_LENGTH or more.
function code(raw: string | undefined): { code: string | null; weak: boolean } {
  const text = raw?.trim() ?? ''
  if (text === '') return { code: null, weak: false }
  return text.length >= MIN_CODE_LENGTH ? { code: text, weak: false } : { code: null, weak: true }
}

function wholeNumber(raw: string | undefined): number {
  const text = raw?.trim() ?? ''
  return /^\d{1,6}$/.test(text) ? Number(text) : 0
}

export function readEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const model = source.OPENAI_CHAT_MODEL?.trim() ?? ''
  const enroll = code(source.MUNICIPAL_ENROLL_CODE)
  const view = code(source.DOH_VIEW_CODE)
  return {
    databaseUrl: value(source.DATABASE_URL),
    enrollCode: enroll.code,
    viewCode: view.code,
    weakCodes: { enroll: enroll.weak, view: view.weak },
    openaiApiKey: value(source.OPENAI_API_KEY),
    openaiModel: /^[A-Za-z0-9._:-]{1,64}$/.test(model) ? model : DEFAULT_OPENAI_MODEL,
    lunaEnabled: ['true', '1'].includes(source.LUNA_ENABLED?.trim().toLowerCase() ?? ''),
    lunaDailyLimit: wholeNumber(source.LUNA_DAILY_LIMIT),
  }
}

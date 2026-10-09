// The server's settings, read from the environment (set by the owner in the
// Vercel dashboard; Vercel's Neon integration injects DATABASE_URL). Values
// are never logged or returned; only whether each one is set.

export type ServerEnv = {
  databaseUrl: string | null
  // Admits a municipal laptop's key once (POST /api/enroll).
  enrollCode: string | null
  // Opens the DOH view (GET /api/reports, the alerts routes).
  viewCode: string | null
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

function wholeNumber(raw: string | undefined): number {
  const text = raw?.trim() ?? ''
  return /^\d{1,6}$/.test(text) ? Number(text) : 0
}

export function readEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const model = source.OPENAI_CHAT_MODEL?.trim() ?? ''
  return {
    databaseUrl: value(source.DATABASE_URL),
    enrollCode: value(source.MUNICIPAL_ENROLL_CODE),
    viewCode: value(source.DOH_VIEW_CODE),
    openaiApiKey: value(source.OPENAI_API_KEY),
    openaiModel: /^[A-Za-z0-9._:-]{1,64}$/.test(model) ? model : DEFAULT_OPENAI_MODEL,
    lunaEnabled: ['true', '1'].includes(source.LUNA_ENABLED?.trim().toLowerCase() ?? ''),
    lunaDailyLimit: wholeNumber(source.LUNA_DAILY_LIMIT),
  }
}

// The server's settings, read from the environment (set by the owner in the
// Vercel dashboard; Vercel's Neon integration injects DATABASE_URL). Values
// are never logged or returned; only whether each one is set.

export type ServerEnv = {
  databaseUrl: string | null
  // Admits a municipal laptop's key once (POST /api/enroll).
  enrollCode: string | null
  // Opens the DOH view (GET /api/reports).
  viewCode: string | null
}

const value = (raw: string | undefined): string | null => (raw && raw.trim() !== '' ? raw : null)

export function readEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  return {
    databaseUrl: value(source.DATABASE_URL),
    enrollCode: value(source.MUNICIPAL_ENROLL_CODE),
    viewCode: value(source.DOH_VIEW_CODE),
  }
}

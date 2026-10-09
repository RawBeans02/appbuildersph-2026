import { createHash, createHmac } from 'node:crypto'
import { HttpError } from './http.js'
import type { Store } from './store.js'

// Fixed-window rate limits per client address and route, counted in the
// rate_limits table so every function instance shares them. Checked before
// any code or signature is looked at, so they also slow down guessing.

export type Route = 'enroll' | 'sync' | 'reports' | 'alerts-draft' | 'alerts' | 'alerts-decide' | 'inbox'

export const LIMITS: Record<Route, { max: number; windowMs: number }> = {
  enroll: { max: 5, windowMs: 10 * 60_000 },
  sync: { max: 30, windowMs: 60_000 },
  reports: { max: 60, windowMs: 60_000 },
  // Each draft request can call the model once per alert (at most 8), on top
  // of the daily limit (LUNA_DAILY_LIMIT).
  'alerts-draft': { max: 5, windowMs: 10 * 60_000 },
  alerts: { max: 60, windowMs: 60_000 },
  'alerts-decide': { max: 30, windowMs: 60_000 },
  inbox: { max: 30, windowMs: 60_000 },
}

// Windows older than this are deleted as new hits come in.
export const KEEP_WINDOWS_MS = 60 * 60_000

// The stored key is a keyed hash of the route and the address, never the
// address itself. The hash key comes from a server-only secret (the database
// URL, which holds its password), so the table alone can't be turned back
// into addresses by trying them all.
export function rateLimitKey(route: Route, ip: string, secret: string): string {
  const hashKey = createHash('sha256').update(`agapay-rate-limit|${secret}`).digest()
  const digest = createHmac('sha256', hashKey).update(`${route}|${ip}`).digest('hex')
  return `${route}:${digest.slice(0, 32)}`
}

export function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs)
}

// Counts this request; throws a 429 with Retry-After (seconds to the next
// window) once the window's limit is passed.
export async function enforceRateLimit(store: Store, route: Route, ip: string, secret: string, now: Date): Promise<void> {
  const { max, windowMs } = LIMITS[route]
  const start = windowStart(now, windowMs)
  const count = await store.hitRateLimit(rateLimitKey(route, ip, secret), start, new Date(now.getTime() - KEEP_WINDOWS_MS))
  if (count > max) {
    const retryAfter = Math.max(1, Math.ceil((start.getTime() + windowMs - now.getTime()) / 1000))
    throw new HttpError('rate-limited', 'Too many requests. Try again later.', { 'retry-after': String(retryAfter) })
  }
}

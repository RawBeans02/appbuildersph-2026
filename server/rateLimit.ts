import { createHash, createHmac } from 'node:crypto'
import { HttpError } from './http.js'
import type { Store } from './store.js'

// Fixed-window rate limits per client address and route, counted in the
// rate_limits table so every function instance shares them. Checked before
// any code or signature is looked at, so they also slow down guessing.

export type Route = 'enroll' | 'sync' | 'reports' | 'alerts-draft' | 'alerts' | 'alerts-decide' | 'inbox'

// Wrong DOH view codes, counted per address across every view-code route.
export type Bucket = Route | 'view-code-wrong'

export const LIMITS: Record<Bucket, { max: number; windowMs: number }> = {
  enroll: { max: 5, windowMs: 10 * 60_000 },
  sync: { max: 30, windowMs: 60_000 },
  reports: { max: 60, windowMs: 60_000 },
  // Each draft request makes at most 9 calls to the model (one per alert, at
  // most 8, plus one parameter renegotiation; luna/draft.ts), on top of the
  // daily limit (LUNA_DAILY_LIMIT).
  'alerts-draft': { max: 5, windowMs: 10 * 60_000 },
  alerts: { max: 60, windowMs: 60_000 },
  'alerts-decide': { max: 30, windowMs: 60_000 },
  inbox: { max: 30, windowMs: 60_000 },
  // 10 wrong view codes per 10 minutes per address; past that, every
  // view-code request from it answers 429 until the window ends, the right
  // code included, so guessing can't go faster than this.
  'view-code-wrong': { max: 10, windowMs: 10 * 60_000 },
}

// Windows older than this are deleted as new hits come in.
export const KEEP_WINDOWS_MS = 60 * 60_000

// The stored key is a keyed hash of the route and the address, never the
// address itself. The hash key comes from a server-only secret (the database
// URL, which holds its password), so the table alone can't be turned back
// into addresses by trying them all.
export function rateLimitKey(route: Bucket, ip: string, secret: string): string {
  const hashKey = createHash('sha256').update(`agapay-rate-limit|${secret}`).digest()
  const digest = createHmac('sha256', hashKey).update(`${route}|${ip}`).digest('hex')
  return `${route}:${digest.slice(0, 32)}`
}

export function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs)
}

function tooMany(start: Date, windowMs: number, now: Date, message = 'Too many requests. Try again later.'): HttpError {
  const retryAfter = Math.max(1, Math.ceil((start.getTime() + windowMs - now.getTime()) / 1000))
  return new HttpError('rate-limited', message, { 'retry-after': String(retryAfter) })
}

// Counts this request; throws a 429 with Retry-After (seconds to the next
// window) once the window's limit is passed.
export async function enforceRateLimit(store: Store, route: Route, ip: string, secret: string, now: Date): Promise<void> {
  const { max, windowMs } = LIMITS[route]
  const start = windowStart(now, windowMs)
  const count = await store.hitRateLimit(rateLimitKey(route, ip, secret), start, new Date(now.getTime() - KEEP_WINDOWS_MS))
  if (count > max) throw tooMany(start, windowMs, now)
}

// Before a view code is compared: 429 when this address already sent the
// window's limit of wrong codes.
export async function refuseViewCodeGuessing(store: Store, ip: string, secret: string, now: Date): Promise<void> {
  const { max, windowMs } = LIMITS['view-code-wrong']
  const start = windowStart(now, windowMs)
  const wrong = await store.rateLimitCount(rateLimitKey('view-code-wrong', ip, secret), start)
  if (wrong >= max) throw tooMany(start, windowMs, now, 'Too many wrong view codes from this address. Try again later.')
}

// Counts one wrong view code from this address; returns the window's count.
export function countWrongViewCode(store: Store, ip: string, secret: string, now: Date): Promise<number> {
  const start = windowStart(now, LIMITS['view-code-wrong'].windowMs)
  return store.hitRateLimit(rateLimitKey('view-code-wrong', ip, secret), start, new Date(now.getTime() - KEEP_WINDOWS_MS))
}

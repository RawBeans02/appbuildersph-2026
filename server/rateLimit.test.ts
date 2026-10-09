import { describe, expect, it } from 'vitest'
import { handleAlerts, handleEnroll, handleReports } from './handlers.js'
import { HttpError } from './http.js'
import { enforceRateLimit, LIMITS, rateLimitKey, windowStart } from './rateLimit.js'
import { createMemoryStore } from './test/memoryStore.js'
import { VIEW_CODE_HEADER } from './protocol.js'
import { body, deps, enrollRequest, makeDevice, NOW, reportsRequest, VIEW_CODE } from './test/fixtures.js'

describe('rate limits', () => {
  it('uses fixed windows', () => {
    const minute = 60_000
    expect(windowStart(new Date('2026-10-10T01:00:59.999Z'), minute).toISOString()).toBe('2026-10-10T01:00:00.000Z')
    expect(windowStart(new Date('2026-10-10T01:01:00.000Z'), minute).toISOString()).toBe('2026-10-10T01:01:00.000Z')
  })

  it('stores a keyed hash of the address, never the address', () => {
    const key = rateLimitKey('sync', '203.0.113.7', 'secret-a')
    expect(key).toMatch(/^sync:[0-9a-f]{32}$/)
    expect(key).not.toContain('203.0.113.7')
    expect(rateLimitKey('sync', '203.0.113.7', 'secret-a')).toBe(key)
    expect(rateLimitKey('sync', '203.0.113.7', 'secret-b')).not.toBe(key)
    expect(rateLimitKey('reports', '203.0.113.7', 'secret-a')).not.toBe(key)
  })

  it('allows the limit, then answers 429 with Retry-After until the next window', async () => {
    const store = createMemoryStore()
    const at = new Date('2026-10-10T01:00:20.000Z')
    for (let i = 0; i < LIMITS.sync.max; i++) await enforceRateLimit(store, 'sync', '198.51.100.1', 's', at)
    const error = await enforceRateLimit(store, 'sync', '198.51.100.1', 's', at).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    const response = (error as HttpError).toResponse()
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('40')
    // Another address and another route have their own counts.
    await enforceRateLimit(store, 'sync', '198.51.100.2', 's', at)
    await enforceRateLimit(store, 'reports', '198.51.100.1', 's', at)
    // The next window starts over.
    await enforceRateLimit(store, 'sync', '198.51.100.1', 's', new Date('2026-10-10T01:01:00.000Z'))
  })

  it('limits enroll attempts to 5 per 10 minutes per address, before the code is checked', async () => {
    const store = createMemoryStore()
    const laptop = await makeDevice()
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      statuses.push((await handleEnroll(await enrollRequest(laptop, { code: `guess-${i}` }), deps(store))).status)
    }
    expect(statuses).toEqual([403, 403, 403, 403, 403, 429])
    // Even the right code waits for the window.
    expect((await handleEnroll(await enrollRequest(laptop), deps(store))).status).toBe(429)
    expect(store.auditLog.filter((entry) => entry.action === 'enroll-refused')).toHaveLength(5)
    const later = new Date(NOW.getTime() + LIMITS.enroll.windowMs)
    expect((await handleEnroll(await enrollRequest(laptop), deps(store, {}, later))).status).toBe(200)
  })

  it('limits DOH view reads to 60 a minute', async () => {
    const store = createMemoryStore()
    const statuses = new Set<number>()
    for (let i = 0; i < LIMITS.reports.max; i++) statuses.add((await handleReports(reportsRequest(), deps(store))).status)
    expect([...statuses]).toEqual([200])
    const limited = await handleReports(reportsRequest(), deps(store))
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('allows 10 wrong view codes per 10 minutes per address, then 429 even for the right code, and logs each without the value', async () => {
    const store = createMemoryStore()
    const guesses = Array.from({ length: LIMITS['view-code-wrong'].max }, (_, i) => `guess-number-${i}-abcdef`)
    const statuses: number[] = []
    for (const guess of guesses) statuses.push((await handleReports(reportsRequest('SID', guess), deps(store))).status)
    expect(statuses).toEqual(Array(10).fill(403))
    const blocked = await handleReports(reportsRequest('SID'), deps(store))
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await body(blocked)).toMatchObject({ error: 'rate-limited', message: 'Too many wrong view codes from this address. Try again later.' })

    const refusals = store.auditLog.filter((entry) => entry.action === 'view-code-refused')
    expect(refusals.map((entry) => entry.detail)).toEqual(guesses.map((_, i) => ({ route: 'reports', wrongInWindow: i + 1 })))
    expect(refusals.every((entry) => entry.actor === 'doh-view')).toBe(true)
    // Never the value tried, nor the address.
    const logged = JSON.stringify(store.auditLog)
    for (const guess of guesses) expect(logged).not.toContain(guess)
    expect(logged).not.toContain('203.0.113.7')

    // Another address isn't held back; this one is again after the window.
    const elsewhere = new Request('https://agapay.test/api/reports?municipality=SID', { headers: { 'x-real-ip': '198.51.100.9', [VIEW_CODE_HEADER]: VIEW_CODE } })
    expect((await handleReports(elsewhere, deps(store))).status).toBe(200)
    const later = new Date(NOW.getTime() + LIMITS['view-code-wrong'].windowMs)
    expect((await handleReports(reportsRequest('SID'), deps(store, {}, later))).status).toBe(200)
  })

  it('counts wrong view codes across every view-code route, and not the right ones', async () => {
    const store = createMemoryStore()
    const alertsWith = (code: string) =>
      new Request('https://agapay.test/api/alerts?municipality=SID', { headers: { 'x-real-ip': '203.0.113.7', [VIEW_CODE_HEADER]: code } })
    for (let i = 0; i < 20; i++) expect((await handleReports(reportsRequest('SID'), deps(store))).status).toBe(200)
    for (let i = 0; i < 5; i++) expect((await handleReports(reportsRequest('SID', `wrong-${i}`), deps(store))).status).toBe(403)
    for (let i = 0; i < 5; i++) expect((await handleAlerts(alertsWith(`wrong-${i}`), deps(store))).status).toBe(403)
    expect((await handleAlerts(alertsWith(VIEW_CODE), deps(store))).status).toBe(429)
    expect(store.auditLog.filter((entry) => entry.action === 'view-code-refused').map((entry) => entry.detail.route)).toEqual([
      ...Array(5).fill('reports'),
      ...Array(5).fill('alerts'),
    ])
  })

  it('drops windows older than an hour', async () => {
    const store = createMemoryStore()
    await enforceRateLimit(store, 'sync', '198.51.100.1', 's', NOW)
    await enforceRateLimit(store, 'sync', '198.51.100.1', 's', new Date(NOW.getTime() + 2 * 60 * 60_000))
    expect(store.rateLimits.size).toBe(1)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { MIN_CODE_LENGTH, readEnv } from './env.js'
import { handleAlerts, handleEnroll, handleHealth, handleReports, resetHealthCache, type Deps } from './handlers.js'
import type { HealthResponse } from './protocol.js'
import { createMemoryStore } from './test/memoryStore.js'
import { body, enrollRequest, makeDevice, NOW, reportsRequest, TEST_DATABASE_URL, VIEW_CODE } from './test/fixtures.js'

// The codes' strength rule, through readEnv as the deployed functions read
// the settings. Invented values only.

const SIXTEEN = 'abcdefghijklmnop'

describe('the enroll and view codes', () => {
  it('are trimmed, and count as not set below 16 characters', () => {
    expect(MIN_CODE_LENGTH).toBe(16)
    const env = readEnv({ MUNICIPAL_ENROLL_CODE: `  ${SIXTEEN}\n`, DOH_VIEW_CODE: ' short-code ' })
    expect(env.enrollCode).toBe(SIXTEEN)
    expect(env.viewCode).toBeNull()
    expect(env.weakCodes).toEqual({ enroll: false, view: true })
    // 15 characters with spaces around them is still 15.
    expect(readEnv({ DOH_VIEW_CODE: `   ${SIXTEEN.slice(1)}   ` })).toMatchObject({ viewCode: null, weakCodes: { view: true } })
    // Missing or blank: not set, and not "weak" either.
    expect(readEnv({ DOH_VIEW_CODE: '   ' })).toMatchObject({ viewCode: null, enrollCode: null, weakCodes: { enroll: false, view: false } })
  })
})

describe('a short code closes its routes and says so in health', () => {
  const store = createMemoryStore()
  const weak: Deps = {
    env: readEnv({ DATABASE_URL: TEST_DATABASE_URL, MUNICIPAL_ENROLL_CODE: 'enroll-15-chars', DOH_VIEW_CODE: 'view-code' }),
    openStore: async () => store,
    now: () => NOW,
  }
  beforeEach(() => resetHealthCache())

  it('answers 503 "not configured", even for the short code itself', async () => {
    const laptop = await makeDevice()
    const enroll = await handleEnroll(await enrollRequest(laptop, { code: 'enroll-15-chars' }), weak)
    expect(enroll.status).toBe(503)
    expect(await body(enroll)).toMatchObject({ error: 'not-configured' })
    expect((await handleReports(reportsRequest('SID', 'view-code'), weak)).status).toBe(503)
    const alerts = new Request('https://agapay.test/api/alerts?municipality=SID', { headers: { 'x-agapay-view-code': 'view-code' } })
    expect((await handleAlerts(alerts, weak)).status).toBe(503)
    expect(store.devices.size).toBe(0)
  })

  it('reports each code as set but not strong enough, as booleans only', async () => {
    const response = await handleHealth(new Request('https://agapay.test/api/health'), weak)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      ok: true,
      database: { configured: true, reachable: true },
      enrollConfigured: true,
      viewConfigured: true,
      enrollCodeStrongEnough: false,
      viewCodeStrongEnough: false,
    } satisfies HealthResponse)
    expect(text).not.toContain('view-code')
    const strong: Deps = { ...weak, env: readEnv({ DATABASE_URL: TEST_DATABASE_URL, MUNICIPAL_ENROLL_CODE: SIXTEEN, DOH_VIEW_CODE: VIEW_CODE }) }
    resetHealthCache()
    expect(await body<HealthResponse>(await handleHealth(new Request('https://agapay.test/api/health'), strong))).toMatchObject({
      enrollCodeStrongEnough: true,
      viewCodeStrongEnough: true,
    })
  })
})

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applySchema, closePool, createPgStore, getPool, openStore } from '../db.js'
import { readEnv } from '../env.js'
import { handleEnroll, handleHealth, handleReports, handleSync, resetHealthCache, type Deps } from '../handlers.js'
import type { ReportsResponse, SyncData, SyncResponse } from '../protocol.js'
import { LIMITS } from '../rateLimit.js'
import { body, enrollRequest, makeDevice, NOW, qrText, reportsRequest, syncRequest, type TestDevice } from '../test/fixtures.js'

// The handlers against a real Postgres (CI's postgres:16 service container):
// the SQL in db.ts, its constraints and transactions, end to end. Needs
// DATABASE_URL, MUNICIPAL_ENROLL_CODE and DOH_VIEW_CODE (dummy values in the
// CI job; never a real database).

const env = readEnv()
if (!env.databaseUrl || !env.enrollCode || !env.viewCode) {
  throw new Error('npm run test:api needs DATABASE_URL, MUNICIPAL_ENROLL_CODE and DOH_VIEW_CODE (see the api job in ci.yml).')
}
const databaseUrl = env.databaseUrl
const enrollCode = env.enrollCode
const viewCode = env.viewCode

let clock = NOW.getTime()
function realDeps(now = new Date(clock)): Deps {
  return { env, openStore, now: () => now }
}

async function enroll(laptop: TestDevice, municipality = 'SID'): Promise<void> {
  const response = await handleEnroll(await enrollRequest(laptop, { code: enrollCode, municipality }), realDeps())
  expect(response.status).toBe(200)
}

async function sync(laptop: TestDevice, data: SyncData): Promise<SyncResponse> {
  clock += 1000
  const now = new Date(clock)
  const response = await handleSync(await syncRequest(laptop, data, { now }), realDeps(now))
  expect(response.status).toBe(200)
  return body<SyncResponse>(response)
}

const TABLES = 'devices, barangay_keys, reports, nonces, rate_limits, audit_log, alerts'

beforeAll(async () => {
  await openStore(databaseUrl)
})

beforeEach(async () => {
  await getPool(databaseUrl).query(`TRUNCATE ${TABLES} RESTART IDENTITY CASCADE`)
  resetHealthCache()
})

afterAll(async () => {
  await closePool()
})

describe('schema', () => {
  it('is created idempotently, even by several instances at once', async () => {
    const pool = getPool(databaseUrl)
    const clients = await Promise.all([pool.connect(), pool.connect(), pool.connect()])
    try {
      await Promise.all(clients.map((client) => applySchema(client)))
    } finally {
      clients.forEach((client) => client.release())
    }
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    )
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['alerts', 'audit_log', 'barangay_keys', 'devices', 'nonces', 'rate_limits', 'reports']),
    )
  })

  it('has no column for a name, birth date, household or purok', async () => {
    const columns = await getPool(databaseUrl).query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    )
    const names = columns.rows.map((row) => row.column_name)
    for (const personal of ['name', 'birth_date', 'birthdate', 'household', 'household_id', 'purok', 'resident_id']) {
      expect(names).not.toContain(personal)
    }
  })

  it('refuses text outside the code and week patterns', async () => {
    const pool = getPool(databaseUrl)
    const laptop = await makeDevice()
    await expect(
      pool.query(`INSERT INTO devices VALUES ($1, 'municipal', 'San Isidro', '{}'::jsonb, now())`, [laptop.fingerprint]),
    ).rejects.toThrow(/check constraint/)
    await enroll(laptop)
    await expect(
      pool.query(
        `INSERT INTO reports VALUES ('SID-MAL', 'Oct 10, 2026', 1, 'SID', '{}'::jsonb, $1, $1, now())`,
        [laptop.fingerprint],
      ),
    ).rejects.toThrow(/check constraint/)
  })
})

describe('enroll, sync and the DOH view on Postgres', () => {
  it('runs end to end, keeping the newest seq per barangay and week', async () => {
    const [laptop, mal, bgs] = await Promise.all([makeDevice(), makeDevice(), makeDevice()])
    await enroll(laptop)
    const keys = [
      { barangay: 'SID-MAL', publicJwk: mal.publicJwk },
      { barangay: 'SID-BGS', publicJwk: bgs.publicJwk },
    ]

    const first = await sync(laptop, { barangayKeys: keys, reports: [await qrText(mal, { seq: 5 }), await qrText(bgs, { barangay: 'SID-BGS', seq: 2 })] })
    expect(first.barangayKeys.map((item) => item.ok && item.status)).toEqual(['stored', 'stored'])
    expect(first.reports.map((item) => item.ok && item.status)).toEqual(['stored', 'stored'])

    const second = await sync(laptop, {
      barangayKeys: keys,
      reports: [await qrText(mal, { seq: 4 }), await qrText(mal, { seq: 5 }), await qrText(mal, { seq: 6 }), await qrText(bgs, { seq: 9 })],
    })
    expect(second.barangayKeys.map((item) => item.ok && item.status)).toEqual(['unchanged', 'unchanged'])
    expect(second.reports.map((item) => (item.ok ? item.status : item.code))).toEqual(['kept-newer', 'unchanged', 'stored', 'bad-signature'])

    const pool = getPool(databaseUrl)
    const rows = await pool.query('SELECT barangay, epi_week, seq, phone_fingerprint, received_from FROM reports ORDER BY barangay')
    expect(rows.rows).toEqual([
      { barangay: 'SID-BGS', epi_week: '2026-W41', seq: 2, phone_fingerprint: bgs.fingerprint, received_from: laptop.fingerprint },
      { barangay: 'SID-MAL', epi_week: '2026-W41', seq: 6, phone_fingerprint: mal.fingerprint, received_from: laptop.fingerprint },
    ])

    const response = await handleReports(reportsRequest('SID', viewCode), realDeps())
    expect(response.status).toBe(200)
    const view = await body<ReportsResponse>(response)
    expect(view.rows.map((row) => [row.barangay, row.seq])).toEqual([
      ['SID-BGS', 2],
      ['SID-MAL', 6],
    ])
    expect(view.totals).toMatchObject({ epiWeek: '2026-W41', barangays: 2 })
    expect(view.rows[1].counts.exposed.m2to12).toBe('<5')

    const audit = await pool.query<{ actor: string; action: string; detail: unknown }>('SELECT actor, action, detail FROM audit_log ORDER BY id')
    expect(audit.rows.map((row) => row.action)).toEqual(['enroll', 'sync', 'sync', 'view-reports'])
    expect(audit.rows[2].detail).toEqual({ barangayKeys: { unchanged: 2 }, reports: { 'kept-newer': 1, unchanged: 1, stored: 1, 'bad-signature': 1 } })
  })

  it('replaces a report when the barangay re-paired a new phone', async () => {
    const [laptop, oldPhone, newPhone] = await Promise.all([makeDevice(), makeDevice(), makeDevice()])
    await enroll(laptop)
    await sync(laptop, { barangayKeys: [{ barangay: 'SID-MAL', publicJwk: oldPhone.publicJwk }], reports: [await qrText(oldPhone, { seq: 8 })] })
    const result = await sync(laptop, { barangayKeys: [{ barangay: 'SID-MAL', publicJwk: newPhone.publicJwk }], reports: [await qrText(newPhone, { seq: 1 })] })
    expect(result.reports[0]).toMatchObject({ ok: true, status: 'stored' })
    const row = await getPool(databaseUrl).query('SELECT seq, phone_fingerprint FROM reports')
    expect(row.rows).toEqual([{ seq: 1, phone_fingerprint: newPhone.fingerprint }])
  })

  it('refuses a cross-municipality vouch and report', async () => {
    const [laptop, phone] = await Promise.all([makeDevice(), makeDevice()])
    await enroll(laptop)
    const result = await sync(laptop, {
      barangayKeys: [{ barangay: 'ABC-MAL', publicJwk: phone.publicJwk }],
      reports: [await qrText(phone, { barangay: 'ABC-MAL' })],
    })
    expect(result.barangayKeys[0]).toMatchObject({ ok: false, code: 'other-municipality' })
    expect(result.reports[0]).toMatchObject({ ok: false, code: 'other-municipality' })
    const counts = await getPool(databaseUrl).query('SELECT (SELECT count(*) FROM barangay_keys)::int AS keys, (SELECT count(*) FROM reports)::int AS reports')
    expect(counts.rows[0]).toEqual({ keys: 0, reports: 0 })
  })

  it('refuses a replayed nonce and a stale ts', async () => {
    const laptop = await makeDevice()
    await enroll(laptop)
    const empty = { barangayKeys: [], reports: [] }
    const now = new Date(clock)
    const nonce = 'BBBBBBBBBBBBBBBBBBBBBB'
    expect((await handleSync(await syncRequest(laptop, empty, { now, nonce }), realDeps(now))).status).toBe(200)
    expect((await handleSync(await syncRequest(laptop, empty, { now, nonce }), realDeps(now))).status).toBe(409)
    const stale = new Date(now.getTime() - 6 * 60_000)
    expect((await handleSync(await syncRequest(laptop, empty, { now: stale }), realDeps(now))).status).toBe(401)
  })

  it('rate-limits enroll in the shared table, with Retry-After', async () => {
    const laptop = await makeDevice()
    const statuses: number[] = []
    let last: Response | null = null
    for (let i = 0; i <= LIMITS.enroll.max; i++) {
      last = await handleEnroll(await enrollRequest(laptop, { code: `wrong-${i}` }), realDeps())
      statuses.push(last.status)
    }
    expect(statuses).toEqual([...Array(LIMITS.enroll.max).fill(403), 429])
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0)
    const stored = await getPool(databaseUrl).query<{ key: string }>('SELECT key FROM rate_limits')
    expect(stored.rows.every((row) => /^enroll:[0-9a-f]{32}$/.test(row.key))).toBe(true)
  })

  it('rolls back everything a failed sync wrote', async () => {
    const [laptop, phone] = await Promise.all([makeDevice(), makeDevice()])
    await enroll(laptop)
    const store = createPgStore(getPool(databaseUrl))
    const device = await store.getDevice(laptop.fingerprint)
    expect(device).not.toBeNull()
    await expect(
      store.transaction(async (tx) => {
        await tx.putBarangayKey({
          barangay: 'SID-MAL',
          municipality: 'SID',
          publicJwk: phone.publicJwk,
          fingerprint: phone.fingerprint,
          vouchedBy: laptop.fingerprint,
          updatedAt: new Date(clock),
        })
        throw new Error('stop')
      }),
    ).rejects.toThrow('stop')
    expect((await getPool(databaseUrl).query('SELECT 1 FROM barangay_keys')).rowCount).toBe(0)
  })

  it('reports a reachable database in health', async () => {
    const response = await handleHealth(new Request('https://agapay.test/api/health'), realDeps())
    expect(await body(response)).toEqual({ ok: true, database: { configured: true, reachable: true }, enrollConfigured: true, viewConfigured: true })
  })
})

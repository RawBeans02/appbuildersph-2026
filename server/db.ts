import pg from 'pg'
import type { PublicJwk } from '../src/qr/index.js'
import type { AuditEntry, BarangayKeyRecord, ReportRecord, ReportWrite, Store } from './store.js'

// Postgres (Neon through Vercel in production, a postgres:16 container in CI)
// through node-postgres. One small pool per function instance; the schema is
// created on first use, once per instance.
//
// No column holds a name, birth date, household, purok or a person's date:
// the CHECK constraints keep codes, weeks and fingerprints in their fixed
// patterns, and report payloads are verified QR payloads (counts only).

export type Queryable = Pick<pg.ClientBase, 'query'>

const CODE_M = `'^[A-Z0-9]{3}$'`
const CODE_B = `'^[A-Z0-9]{3}-[A-Z0-9]{3}$'`
const FINGERPRINT = `'^[0-9A-F]{4}(-[0-9A-F]{4}){3}$'`
const WEEK = `'^20[0-9]{2}-W[0-9]{2}$'`

export const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS devices (
    fingerprint text PRIMARY KEY CHECK (fingerprint ~ ${FINGERPRINT}),
    role text NOT NULL CHECK (role = 'municipal'),
    municipality text NOT NULL CHECK (municipality ~ ${CODE_M}),
    public_jwk jsonb NOT NULL,
    enrolled_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS barangay_keys (
    barangay text PRIMARY KEY CHECK (barangay ~ ${CODE_B}),
    municipality text NOT NULL CHECK (municipality ~ ${CODE_M}),
    public_jwk jsonb NOT NULL,
    fingerprint text NOT NULL CHECK (fingerprint ~ ${FINGERPRINT}),
    vouched_by text NOT NULL REFERENCES devices (fingerprint),
    updated_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS barangay_keys_municipality ON barangay_keys (municipality)`,
  `CREATE TABLE IF NOT EXISTS reports (
    barangay text NOT NULL CHECK (barangay ~ ${CODE_B}),
    epi_week text NOT NULL CHECK (epi_week ~ ${WEEK}),
    seq integer NOT NULL CHECK (seq BETWEEN 1 AND 999999),
    municipality text NOT NULL CHECK (municipality ~ ${CODE_M}),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    phone_fingerprint text NOT NULL CHECK (phone_fingerprint ~ ${FINGERPRINT}),
    received_from text NOT NULL REFERENCES devices (fingerprint),
    received_at timestamptz NOT NULL,
    UNIQUE (barangay, epi_week)
  )`,
  `CREATE INDEX IF NOT EXISTS reports_latest ON reports (municipality, barangay, epi_week DESC)`,
  `CREATE TABLE IF NOT EXISTS nonces (
    nonce text PRIMARY KEY,
    seen_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS nonces_seen_at ON nonces (seen_at)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key text NOT NULL,
    window_start timestamptz NOT NULL,
    count integer NOT NULL,
    PRIMARY KEY (key, window_start)
  )`,
  `CREATE INDEX IF NOT EXISTS rate_limits_window ON rate_limits (window_start)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    actor text NOT NULL,
    action text NOT NULL,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (at)`,
  // For P2-C: alerts drafted from the aggregates, approved by a role.
  `CREATE TABLE IF NOT EXISTS alerts (
    id bigserial PRIMARY KEY,
    municipality text NOT NULL CHECK (municipality ~ ${CODE_M}),
    barangay text CHECK (barangay ~ ${CODE_B}),
    epi_week text NOT NULL CHECK (epi_week ~ ${WEEK}),
    text text NOT NULL,
    facts jsonb NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
    drafted_by text NOT NULL,
    approved_by_role text,
    created_at timestamptz NOT NULL DEFAULT now(),
    approved_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS alerts_municipality_status ON alerts (municipality, status)`,
]

// Any fixed number: concurrent cold starts take this transaction lock, so two
// instances never run CREATE TABLE IF NOT EXISTS at the same moment (which
// Postgres can fail on).
const SCHEMA_LOCK = 20261010

export async function applySchema(client: Queryable): Promise<void> {
  await client.query('BEGIN')
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK])
    for (const statement of SCHEMA) await client.query(statement)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

let pool: pg.Pool | null = null
let poolUrl: string | null = null
let schemaReady: Promise<void> | null = null

// The instance's pool for `databaseUrl` (Neon's URL carries sslmode=require).
export function getPool(databaseUrl: string): pg.Pool {
  if (!pool || poolUrl !== databaseUrl) {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 4,
      idleTimeoutMillis: 10_000,
      // Neon's compute may be waking from idle.
      connectionTimeoutMillis: 8_000,
      statement_timeout: 10_000,
      query_timeout: 12_000,
    })
    // An idle client's network error must not crash the instance; the next
    // query gets a fresh connection.
    pool.on('error', () => undefined)
    poolUrl = databaseUrl
    schemaReady = null
  }
  return pool
}

// Creates the tables once per instance (idempotent). A failure is retried on
// the next call.
export function ensureSchema(target: pg.Pool): Promise<void> {
  schemaReady ??= (async () => {
    const client = await target.connect()
    try {
      await applySchema(client)
    } finally {
      client.release()
    }
  })().catch((error: unknown) => {
    schemaReady = null
    throw error
  })
  return schemaReady
}

// Closes the instance's pool (tests; a function instance just stops).
export async function closePool(): Promise<void> {
  const current = pool
  pool = null
  poolUrl = null
  schemaReady = null
  await current?.end()
}

// The instance's store: the pool, with the schema in place.
export async function openStore(databaseUrl: string): Promise<Store> {
  const target = getPool(databaseUrl)
  await ensureSchema(target)
  return createPgStore(target)
}

type DeviceRow = { fingerprint: string; role: 'municipal'; municipality: string; public_jwk: PublicJwk; enrolled_at: Date }
type KeyRow = {
  barangay: string
  municipality: string
  public_jwk: PublicJwk
  fingerprint: string
  vouched_by: string
  updated_at: Date
}
type ReportRow = {
  barangay: string
  epi_week: string
  seq: number
  municipality: string
  payload: unknown
  phone_fingerprint: string
  received_from: string
  received_at: Date
}

const keyRecord = (row: KeyRow): BarangayKeyRecord => ({
  barangay: row.barangay,
  municipality: row.municipality,
  publicJwk: row.public_jwk,
  fingerprint: row.fingerprint,
  vouchedBy: row.vouched_by,
  updatedAt: row.updated_at,
})

const reportRecord = (row: ReportRow): ReportRecord => ({
  barangay: row.barangay,
  epiWeek: row.epi_week,
  seq: row.seq,
  municipality: row.municipality,
  payload: row.payload,
  phoneFingerprint: row.phone_fingerprint,
  receivedFrom: row.received_from,
  receivedAt: row.received_at,
})

// The Store over a pool (each call its own statement) or over one client
// inside a transaction.
export function createPgStore(db: pg.Pool | pg.PoolClient, inTransaction = false): Store {
  const store: Store = {
    async hitRateLimit(key, windowStart, purgeBefore) {
      const result = await db.query<{ count: number }>(
        `WITH purge AS (DELETE FROM rate_limits WHERE window_start < $3)
         INSERT INTO rate_limits (key, window_start, count) VALUES ($1, $2, 1)
         ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
         RETURNING count`,
        [key, windowStart, purgeBefore],
      )
      return result.rows[0].count
    },

    async claimNonce(nonce, now, purgeBefore) {
      const result = await db.query(
        `WITH purge AS (DELETE FROM nonces WHERE seen_at < $3)
         INSERT INTO nonces (nonce, seen_at) VALUES ($1, $2)
         ON CONFLICT (nonce) DO NOTHING
         RETURNING nonce`,
        [nonce, now, purgeBefore],
      )
      return result.rowCount === 1
    },

    async getDevice(fingerprint) {
      const result = await db.query<DeviceRow>(
        'SELECT fingerprint, role, municipality, public_jwk, enrolled_at FROM devices WHERE fingerprint = $1',
        [fingerprint],
      )
      const row = result.rows[0]
      return row
        ? { fingerprint: row.fingerprint, role: row.role, municipality: row.municipality, publicJwk: row.public_jwk, enrolledAt: row.enrolled_at }
        : null
    },

    async putDevice(device) {
      await db.query(
        `INSERT INTO devices (fingerprint, role, municipality, public_jwk, enrolled_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (fingerprint) DO UPDATE SET municipality = EXCLUDED.municipality, enrolled_at = EXCLUDED.enrolled_at`,
        [device.fingerprint, device.role, device.municipality, JSON.stringify(device.publicJwk), device.enrolledAt],
      )
    },

    async putBarangayKey(key) {
      const result = await db.query(
        `INSERT INTO barangay_keys (barangay, municipality, public_jwk, fingerprint, vouched_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (barangay) DO UPDATE SET
           municipality = EXCLUDED.municipality, public_jwk = EXCLUDED.public_jwk, fingerprint = EXCLUDED.fingerprint,
           vouched_by = EXCLUDED.vouched_by, updated_at = EXCLUDED.updated_at
         WHERE barangay_keys.fingerprint <> EXCLUDED.fingerprint
         RETURNING barangay`,
        [key.barangay, key.municipality, JSON.stringify(key.publicJwk), key.fingerprint, key.vouchedBy, key.updatedAt],
      )
      return result.rowCount === 1 ? 'stored' : 'unchanged'
    },

    async barangayKeys(municipality, limit) {
      const result = await db.query<KeyRow>(
        `SELECT barangay, municipality, public_jwk, fingerprint, vouched_by, updated_at
         FROM barangay_keys WHERE municipality = $1 ORDER BY barangay LIMIT $2`,
        [municipality, limit],
      )
      return result.rows.map(keyRecord)
    },

    async putReport(report): Promise<ReportWrite> {
      const written = await db.query(
        `INSERT INTO reports (barangay, epi_week, seq, municipality, payload, phone_fingerprint, received_from, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (barangay, epi_week) DO UPDATE SET
           seq = EXCLUDED.seq, municipality = EXCLUDED.municipality, payload = EXCLUDED.payload,
           phone_fingerprint = EXCLUDED.phone_fingerprint, received_from = EXCLUDED.received_from,
           received_at = EXCLUDED.received_at
         WHERE reports.seq < EXCLUDED.seq OR reports.phone_fingerprint <> EXCLUDED.phone_fingerprint
         RETURNING seq`,
        [
          report.barangay,
          report.epiWeek,
          report.seq,
          report.municipality,
          JSON.stringify(report.payload),
          report.phoneFingerprint,
          report.receivedFrom,
          report.receivedAt,
        ],
      )
      if (written.rowCount === 1) return 'stored'
      const kept = await db.query<{ seq: number }>('SELECT seq FROM reports WHERE barangay = $1 AND epi_week = $2', [
        report.barangay,
        report.epiWeek,
      ])
      return kept.rows[0]?.seq === report.seq ? 'unchanged' : 'kept-newer'
    },

    async latestReports(municipality, limit) {
      const result = await db.query<ReportRow>(
        `SELECT DISTINCT ON (barangay)
           barangay, epi_week, seq, municipality, payload, phone_fingerprint, received_from, received_at
         FROM reports WHERE municipality = $1
         ORDER BY barangay, epi_week DESC
         LIMIT $2`,
        [municipality, limit],
      )
      return result.rows.map(reportRecord)
    },

    async audit(entry: AuditEntry) {
      await db.query('INSERT INTO audit_log (at, actor, action, detail) VALUES ($1, $2, $3, $4)', [
        entry.at,
        entry.actor,
        entry.action,
        JSON.stringify(entry.detail),
      ])
    },

    async transaction(work) {
      if (inTransaction) return work(store)
      if (!(db instanceof pg.Pool)) throw new Error('A transaction needs the pool.')
      const client = await db.connect()
      try {
        await client.query('BEGIN')
        const result = await work(createPgStore(client, true))
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },

    async ping() {
      try {
        await db.query('SELECT 1')
        return true
      } catch {
        return false
      }
    },
  }
  return store
}

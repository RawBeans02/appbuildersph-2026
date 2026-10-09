import pg from 'pg'
import type { PublicJwk } from '../src/qr/index.js'
import type { AlertRecord, AuditEntry, BarangayKeyRecord, ReportRecord, ReportWrite, Store } from './store.js'
import { acceptedWeeks } from './weeks.js'

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
  // P2-C: what an alert is about, where its wording came from, who decided.
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'watch'
    CHECK (kind IN ('doctor-team', 'move-stock', 'watch'))`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS audience text[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'template' CHECK (source IN ('luna', 'template'))`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS template_text text NOT NULL DEFAULT ''`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS check_reasons jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ai_note text`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS batch text`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS decided_by_role text`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS decided_at timestamptz`,
  // GPT-6 Luna calls per day, for LUNA_DAILY_LIMIT.
  `CREATE TABLE IF NOT EXISTS luna_usage (
    day date PRIMARY KEY,
    calls integer NOT NULL CHECK (calls >= 0)
  )`,
  `CREATE INDEX IF NOT EXISTS barangay_keys_fingerprint ON barangay_keys (fingerprint)`,
  // P2-security: a draft can be superseded by a newer batch. The status CHECK
  // is replaced once (Postgres named the first one alerts_status_check).
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alerts_status_v2') THEN
      ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_status_check;
      ALTER TABLE alerts ADD CONSTRAINT alerts_status_v2 CHECK (status IN ('draft', 'approved', 'rejected', 'superseded'));
    END IF;
  END $$`,
  // An officer's edit makes the source 'edited' (the first CHECK, from ADD
  // COLUMN, is alerts_source_check).
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alerts_source_v2') THEN
      ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_source_check;
      ALTER TABLE alerts ADD CONSTRAINT alerts_source_v2 CHECK (source IN ('luna', 'template', 'edited'));
    END IF;
  END $$`,
]

// Any fixed number: concurrent cold starts take this transaction lock, so two
// instances never run CREATE TABLE IF NOT EXISTS at the same moment (which
// Postgres can fail on).
const SCHEMA_LOCK = 20261010
// With the municipality's hash, while a draft batch replaces the open drafts.
const DRAFT_LOCK = 20261011

// Reports of a week that hasn't come yet (stored before the sync refused
// them) would top the DOH view and drive the alerts until that week: deleted
// on every schema pass, by the same window the sync uses (weeks.ts).
// Idempotent; a deletion is logged with its count.
export const DELETE_FUTURE_REPORTS = 'DELETE FROM reports WHERE epi_week > $1'

export async function applySchema(client: Queryable, now: Date = new Date()): Promise<void> {
  await client.query('BEGIN')
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK])
    for (const statement of SCHEMA) await client.query(statement)
    const latest = acceptedWeeks(now).latest
    const removed = await client.query(DELETE_FUTURE_REPORTS, [latest])
    if (removed.rowCount) {
      await client.query('INSERT INTO audit_log (at, actor, action, detail) VALUES ($1, $2, $3, $4)', [
        now,
        'server',
        'future-reports-deleted',
        JSON.stringify({ rows: removed.rowCount, after: latest }),
      ])
    }
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

type AlertRow = {
  id: string
  municipality: string
  barangay: string
  audience: string[]
  epi_week: string
  kind: AlertRecord['kind']
  text: string
  template_text: string
  facts: unknown
  source: AlertRecord['source']
  check_reasons: string[]
  ai_note: string | null
  drafted_by: string
  batch: string
  created_at: Date
  status: AlertRecord['status']
  approved_by_role: string | null
  approved_at: Date | null
  decided_by_role: string | null
  decided_at: Date | null
}

const ALERT_COLUMNS = `id, municipality, barangay, audience, epi_week, kind, text, template_text, facts, source,
  check_reasons, ai_note, drafted_by, batch, created_at, status, approved_by_role, approved_at, decided_by_role, decided_at`

const alertRecord = (row: AlertRow): AlertRecord => ({
  id: String(row.id),
  municipality: row.municipality,
  barangay: row.barangay,
  audience: row.audience,
  epiWeek: row.epi_week,
  kind: row.kind,
  text: row.text,
  templateText: row.template_text,
  facts: row.facts,
  source: row.source,
  checkReasons: row.check_reasons,
  aiNote: row.ai_note,
  draftedBy: row.drafted_by,
  batch: row.batch,
  createdAt: row.created_at,
  status: row.status,
  approvedByRole: row.approved_by_role,
  approvedAt: row.approved_at,
  decidedByRole: row.decided_by_role,
  decidedAt: row.decided_at,
})

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

    async rateLimitCount(key, windowStart) {
      const result = await db.query<{ count: number }>('SELECT count FROM rate_limits WHERE key = $1 AND window_start = $2', [key, windowStart])
      return result.rows[0]?.count ?? 0
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
      // Only reports signed by the barangay's currently vouched phone key.
      const result = await db.query<ReportRow>(
        `SELECT DISTINCT ON (r.barangay)
           r.barangay, r.epi_week, r.seq, r.municipality, r.payload, r.phone_fingerprint, r.received_from, r.received_at
         FROM reports r
         JOIN barangay_keys k
           ON k.barangay = r.barangay AND k.fingerprint = r.phone_fingerprint AND k.municipality = r.municipality
         WHERE r.municipality = $1
         ORDER BY r.barangay, r.epi_week DESC
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

    async auditTrail(municipality, actions, limit) {
      const result = await db.query<{ at: Date; actor: string; action: string; detail: Record<string, unknown> }>(
        `SELECT at, actor, action, detail FROM audit_log
         WHERE action = ANY($2::text[]) AND detail->>'municipality' = $1
         ORDER BY at DESC, id DESC LIMIT $3`,
        [municipality, actions, limit],
      )
      return result.rows
    },

    async takeLunaCall(day, limit) {
      if (limit < 1) return false
      const result = await db.query(
        `INSERT INTO luna_usage (day, calls) VALUES ($1, 1)
         ON CONFLICT (day) DO UPDATE SET calls = luna_usage.calls + 1 WHERE luna_usage.calls < $2
         RETURNING calls`,
        [day, limit],
      )
      return result.rowCount === 1
    },

    async refundLunaCall(day) {
      await db.query('UPDATE luna_usage SET calls = calls - 1 WHERE day = $1 AND calls > 0', [day])
    },

    async lunaCalls(day) {
      const result = await db.query<{ calls: number }>('SELECT calls FROM luna_usage WHERE day = $1', [day])
      return result.rows[0]?.calls ?? 0
    },

    async insertAlerts(alerts) {
      const records: AlertRecord[] = []
      for (const alert of alerts) {
        const result = await db.query<AlertRow>(
          `INSERT INTO alerts (municipality, barangay, audience, epi_week, kind, text, template_text, facts, source,
             check_reasons, ai_note, drafted_by, batch, created_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'draft')
           RETURNING ${ALERT_COLUMNS}`,
          [
            alert.municipality,
            alert.barangay,
            alert.audience,
            alert.epiWeek,
            alert.kind,
            alert.text,
            alert.templateText,
            JSON.stringify(alert.facts),
            alert.source,
            JSON.stringify(alert.checkReasons),
            alert.aiNote,
            alert.draftedBy,
            alert.batch,
            alert.createdAt,
          ],
        )
        records.push(alertRecord(result.rows[0]))
      }
      return records
    },

    async supersedeDrafts(municipality) {
      // One drafting at a time per municipality (until this transaction ends),
      // so two batches drafted at once can't both stay open.
      await db.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [DRAFT_LOCK, municipality])
      const result = await db.query(`UPDATE alerts SET status = 'superseded' WHERE municipality = $1 AND status = 'draft'`, [municipality])
      return result.rowCount ?? 0
    },

    async getAlert(id) {
      const result = await db.query<AlertRow>(`SELECT ${ALERT_COLUMNS} FROM alerts WHERE id = $1`, [id])
      return result.rows[0] ? alertRecord(result.rows[0]) : null
    },

    async decideAlert(id, decision) {
      const approved = decision.status === 'approved'
      const result = await db.query<AlertRow>(
        `UPDATE alerts SET status = $2, text = $3, decided_by_role = $4, decided_at = $5,
           approved_by_role = $6, approved_at = $7, source = COALESCE($8, source)
         WHERE id = $1 AND status = 'draft'
         RETURNING ${ALERT_COLUMNS}`,
        [
          id,
          decision.status,
          decision.text,
          decision.role,
          decision.at,
          approved ? decision.role : null,
          approved ? decision.at : null,
          decision.source ?? null,
        ],
      )
      return result.rows[0] ? alertRecord(result.rows[0]) : null
    },

    async listAlerts(municipality, statuses, limit) {
      const result = await db.query<AlertRow>(
        `SELECT ${ALERT_COLUMNS} FROM alerts WHERE municipality = $1 AND status = ANY($2::text[])
         ORDER BY created_at DESC, id DESC LIMIT $3`,
        [municipality, statuses, limit],
      )
      return result.rows.map(alertRecord)
    },

    async approvedAlerts(municipality, barangays, limit) {
      const result = await db.query<AlertRow>(
        `SELECT ${ALERT_COLUMNS} FROM alerts
         WHERE municipality = $1 AND status = 'approved' AND ($2::text[] IS NULL OR audience && $2::text[])
         ORDER BY approved_at DESC, id DESC LIMIT $3`,
        [municipality, barangays, limit],
      )
      return result.rows.map(alertRecord)
    },

    async phoneKeys(fingerprint) {
      const result = await db.query<KeyRow>(
        `SELECT barangay, municipality, public_jwk, fingerprint, vouched_by, updated_at
         FROM barangay_keys WHERE fingerprint = $1 ORDER BY barangay LIMIT 10`,
        [fingerprint],
      )
      return result.rows.map(keyRecord)
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

import { authenticate, checkViewCode, enroll, verifySigned } from './auth.js'
import { openStore } from './db.js'
import { readEnv, type ServerEnv } from './env.js'
import { checkDeclaredLength, clientIp, fail, HttpError, json, parseJson, readBody } from './http.js'
import { approveAlert, draftAlerts, listAlerts, readInbox, rejectAlert, type AiDeps } from './luna/alerts.js'
import { SIGNATURE_HEADER, VIEW_CODE_HEADER, type HealthResponse, type InboxResponse } from './protocol.js'
import { enforceRateLimit, type Route } from './rateLimit.js'
import { readReports } from './reports.js'
import type { Store } from './store.js'
import { syncReports } from './sync.js'
import {
  municipalityOf,
  validateApproveBody,
  validateDraftBody,
  validateInboxData,
  validateRejectBody,
  validateSyncData,
} from './validate.js'

// The routes, as Web-standard handlers (Request → Response). api/*.ts are
// one-line wrappers that pass the real settings; tests pass their own. A
// missing setting answers 503 "not configured", never an open endpoint.

export type Deps = {
  env: ServerEnv
  openStore: (databaseUrl: string) => Promise<Store>
  now: () => Date
  // How the alerts call OpenAI: the real fetch, or a test's stand-in.
  ai?: AiDeps
}

export function defaultDeps(): Deps {
  return { env: readEnv(), openStore, now: () => new Date() }
}

const notConfigured = () => fail('not-configured', 'Sync is not set up on this server yet.')

async function run(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse()
    // The error's kind only: never the request, the payloads or a setting.
    console.error('agapay api: unexpected error', error instanceof Error ? `${error.name}: ${error.message}` : 'unknown')
    return fail('server-error', 'Something went wrong on the server. Try again.')
  }
}

// POST /api/enroll { publicJwk, municipality, code }, signed by publicJwk's key.
export async function handleEnroll(request: Request, deps: Deps): Promise<Response> {
  const { databaseUrl, enrollCode } = deps.env
  if (!databaseUrl || !enrollCode) return notConfigured()
  return run(async () => {
    checkDeclaredLength(request)
    const store = await deps.openStore(databaseUrl)
    const now = deps.now()
    await enforceRateLimit(store, 'enroll', clientIp(request), databaseUrl, now)
    const bytes = await readBody(request)
    return json(200, await enroll(store, enrollCode, bytes, request.headers.get(SIGNATURE_HEADER), now))
  })
}

// POST /api/sync { fingerprint, ts, nonce, data: { barangayKeys, reports } }, signed.
export async function handleSync(request: Request, deps: Deps): Promise<Response> {
  const { databaseUrl } = deps.env
  if (!databaseUrl) return notConfigured()
  return run(async () => {
    checkDeclaredLength(request)
    const store = await deps.openStore(databaseUrl)
    const now = deps.now()
    await enforceRateLimit(store, 'sync', clientIp(request), databaseUrl, now)
    const bytes = await readBody(request)
    const { device, envelope } = await authenticate(store, bytes, request.headers.get(SIGNATURE_HEADER), now)
    const data = validateSyncData(envelope.data)
    return json(200, await syncReports(store, device, data, now))
  })
}

// GET /api/reports?municipality=SID with the view code header.
export async function handleReports(request: Request, deps: Deps): Promise<Response> {
  const { databaseUrl, viewCode } = deps.env
  if (!databaseUrl || !viewCode) return notConfigured()
  return run(async () => {
    const store = await deps.openStore(databaseUrl)
    const now = deps.now()
    await enforceRateLimit(store, 'reports', clientIp(request), databaseUrl, now)
    checkViewCode(request.headers.get(VIEW_CODE_HEADER), viewCode)
    const municipality = municipalityOf(new URL(request.url).searchParams.get('municipality'), 'The municipality parameter')
    const result = await readReports(store, municipality)
    await store.audit({ at: now, actor: 'doh-view', action: 'view-reports', detail: { municipality, rows: result.rows.length } })
    return json(200, result)
  })
}

// The database answer is reused for this long per instance, so a burst of
// health checks costs at most one query.
const PING_CACHE_MS = 30_000
let lastPing: { url: string; at: number; reachable: boolean } | null = null

export function resetHealthCache(): void {
  lastPing = null
}

// GET /api/health: whether each setting is present and the database answers.
// Booleans only, never a value.
export async function handleHealth(_request: Request, deps: Deps): Promise<Response> {
  const { databaseUrl, enrollCode, viewCode } = deps.env
  let reachable = false
  if (databaseUrl) {
    const now = deps.now().getTime()
    if (lastPing && lastPing.url === databaseUrl && now - lastPing.at < PING_CACHE_MS) {
      reachable = lastPing.reachable
    } else {
      try {
        reachable = await (await deps.openStore(databaseUrl)).ping()
      } catch {
        reachable = false
      }
      lastPing = { url: databaseUrl, at: now, reachable }
    }
  }
  const body: HealthResponse = {
    ok: true,
    database: { configured: databaseUrl !== null, reachable },
    enrollConfigured: enrollCode !== null,
    viewConfigured: viewCode !== null,
  }
  return json(200, body)
}

// --- Phase 2 alerts (server/luna/) -------------------------------------------

// A DOH view route: the database and the view code are set, the rate limit
// allows it, and the view code matches.
function viewRoute(
  request: Request,
  deps: Deps,
  route: Route,
  work: (store: Store, now: Date) => Promise<Response>,
): Promise<Response> {
  const { databaseUrl, viewCode } = deps.env
  if (!databaseUrl || !viewCode) return Promise.resolve(notConfigured())
  return run(async () => {
    checkDeclaredLength(request)
    const store = await deps.openStore(databaseUrl)
    const now = deps.now()
    await enforceRateLimit(store, route, clientIp(request), databaseUrl, now)
    checkViewCode(request.headers.get(VIEW_CODE_HEADER), viewCode)
    return work(store, now)
  })
}

// POST /api/alerts-draft { municipality }: drafts from the facts; GPT-6 Luna's
// wording only when it's on and passes the check.
export function handleAlertsDraft(request: Request, deps: Deps): Promise<Response> {
  return viewRoute(request, deps, 'alerts-draft', async (store, now) => {
    const { municipality } = validateDraftBody(parseJson(await readBody(request)))
    return json(200, await draftAlerts(store, deps.env, municipality, now, deps.ai ?? {}))
  })
}

// GET /api/alerts?municipality=SID: drafts, decided alerts, the audit trail.
export function handleAlerts(request: Request, deps: Deps): Promise<Response> {
  return viewRoute(request, deps, 'alerts', async (store, now) => {
    const municipality = municipalityOf(new URL(request.url).searchParams.get('municipality'), 'The municipality parameter')
    return json(200, await listAlerts(store, deps.env, municipality, now))
  })
}

// POST /api/alerts-approve { id, approverRole, text? }.
export function handleAlertsApprove(request: Request, deps: Deps): Promise<Response> {
  return viewRoute(request, deps, 'alerts-decide', async (store, now) => {
    const body = validateApproveBody(parseJson(await readBody(request)))
    return json(200, await approveAlert(store, body, now))
  })
}

// POST /api/alerts-reject { id, role }.
export function handleAlertsReject(request: Request, deps: Deps): Promise<Response> {
  return viewRoute(request, deps, 'alerts-decide', async (store, now) => {
    const body = validateRejectBody(parseJson(await readBody(request)))
    return json(200, await rejectAlert(store, body, now))
  })
}

type InboxKey = { publicJwk: JsonWebKey; scope: InboxResponse['scope'] }

// Who a signing key is: an enrolled laptop (its municipality), or a phone key
// an enrolled laptop vouched for (its barangay only).
async function inboxKey(store: Store, fingerprint: string): Promise<InboxKey | null> {
  const device = await store.getDevice(fingerprint)
  if (device) return { publicJwk: device.publicJwk, scope: { device: 'laptop', municipality: device.municipality, barangays: null } }
  const keys = await store.phoneKeys(fingerprint)
  if (keys.length === 0) return null
  const { municipality } = keys[0]
  const barangays = keys.filter((key) => key.municipality === municipality).map((key) => key.barangay)
  return { publicJwk: keys[0].publicJwk, scope: { device: 'phone', municipality, barangays } }
}

// POST /api/inbox { fingerprint, ts, nonce, data: {} }, signed like a sync.
export async function handleInbox(request: Request, deps: Deps): Promise<Response> {
  const { databaseUrl } = deps.env
  if (!databaseUrl) return notConfigured()
  return run(async () => {
    checkDeclaredLength(request)
    const store = await deps.openStore(databaseUrl)
    const now = deps.now()
    await enforceRateLimit(store, 'inbox', clientIp(request), databaseUrl, now)
    const bytes = await readBody(request)
    const { key, envelope } = await verifySigned(store, bytes, request.headers.get(SIGNATURE_HEADER), now, (fingerprint) =>
      inboxKey(store, fingerprint),
    )
    validateInboxData(envelope.data)
    return json(200, await readInbox(store, key.scope, now))
  })
}

import { randomUUID } from 'node:crypto'
import { validatePayload, type QrPayloadV1 } from '../../src/qr/index.js'
import type { ServerEnv } from '../env.js'
import { HttpError } from '../http.js'
import type {
  AiOffReason,
  AiStatus,
  AlertView,
  AlertsResponse,
  AuditView,
  DecideResponse,
  DraftAlertsResponse,
  InboxAlert,
  InboxResponse,
} from '../protocol.js'
import { MAX_REPORT_ROWS } from '../reports.js'
import type { AlertRecord, NewAlert, Store } from '../store.js'
import { checkAlertText } from './check.js'
import { newSession, requestWording, type Fetcher, type LunaSession } from './draft.js'
import { alertCandidates, withCaveats, type AlertCandidate, type AlertFacts } from './facts.js'

// Phase 2 alerts: draft from the facts (template always, GPT-6 Luna's wording
// only when it's on, under the day's limit, and passes the check), then a
// person approves or rejects each one; approved alerts reach the laptop's and
// the barangay phones' inboxes. Every decision is in the audit log.

export const ALERT_ACTIONS = ['alerts-draft', 'alert-approved', 'alert-rejected'] as const
const LIST_LIMIT = 50

export type AiDeps = { fetch?: Fetcher; sleep?: (ms: number) => Promise<void> }

// The calendar day in the Philippines (UTC+8, no daylight saving), for the
// daily limit.
export function phDay(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 10)
}

function offReason(env: ServerEnv): AiOffReason | null {
  if (!env.lunaEnabled) return 'disabled'
  if (!env.openaiApiKey) return 'no-key'
  if (env.lunaDailyLimit < 1) return 'no-limit'
  return null
}

export async function aiStatus(store: Store, env: ServerEnv, now: Date): Promise<AiStatus> {
  const reason = offReason(env)
  if (reason) return { model: env.openaiModel, on: false, reason }
  const callsToday = await store.lunaCalls(phDay(now))
  if (callsToday >= env.lunaDailyLimit) return { model: env.openaiModel, on: false, reason: 'daily-limit' }
  return { model: env.openaiModel, on: true, callsToday, dailyLimit: env.lunaDailyLimit }
}

// The latest verified report per barangay, validated again.
async function latestPayloads(store: Store, municipality: string): Promise<QrPayloadV1[]> {
  const records = await store.latestReports(municipality, MAX_REPORT_ROWS)
  return records.flatMap((record) => {
    const checked = validatePayload(record.payload)
    return checked.ok && checked.value.municipality === municipality && checked.value.barangay === record.barangay ? [checked.value] : []
  })
}

export function alertView(record: AlertRecord): AlertView {
  return {
    id: record.id,
    kind: record.kind,
    municipality: record.municipality,
    barangay: record.barangay,
    audience: record.audience,
    epiWeek: record.epiWeek,
    text: record.text,
    templateText: record.templateText,
    facts: record.facts as Record<string, unknown>,
    source: record.source,
    checkReasons: record.checkReasons,
    aiNote: record.aiNote,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    decidedByRole: record.decidedByRole,
    decidedAt: record.decidedAt?.toISOString() ?? null,
  }
}

type Worded = Pick<NewAlert, 'text' | 'source' | 'checkReasons' | 'aiNote'>

async function word(
  candidate: AlertCandidate,
  store: Store,
  env: ServerEnv,
  status: AiStatus,
  now: Date,
  ai: AiDeps,
  session: LunaSession,
): Promise<Worded> {
  const template: Worded = { text: candidate.templateText, source: 'template', checkReasons: [], aiNote: status.on ? null : status.reason }
  if (!status.on || !env.openaiApiKey) return template
  const day = phDay(now)
  const outcome = await requestWording(candidate, {
    apiKey: env.openaiApiKey,
    model: env.openaiModel,
    takeCall: () => store.takeLunaCall(day, env.lunaDailyLimit),
    refundCall: () => store.refundLunaCall(day),
    session,
    fetch: ai.fetch,
    sleep: ai.sleep,
  })
  if (!outcome.ok) return { ...template, aiNote: outcome.reason }
  // A reply that left out a safety caveat gets it back before the check.
  const text = withCaveats(outcome.text, candidate.kind)
  const check = checkAlertText(text, candidate)
  if (!check.ok) return { ...template, checkReasons: check.reasons, aiNote: 'check-failed' }
  return { text, source: 'luna', checkReasons: [], aiNote: null }
}

// POST /api/alerts-draft: one draft per alert the facts call for.
export async function draftAlerts(store: Store, env: ServerEnv, municipality: string, now: Date, ai: AiDeps = {}): Promise<DraftAlertsResponse> {
  const candidates = alertCandidates(await latestPayloads(store, municipality))
  const status = await aiStatus(store, env, now)
  // One share of OpenAI for the whole request (at most 9 calls, one
  // renegotiation, 45 s). The first alert goes alone, so a parameter the model
  // refuses is learned once; the others then go at the same time.
  const session = newSession()
  const worded: Worded[] = []
  if (candidates.length > 0) {
    worded.push(await word(candidates[0], store, env, status, now, ai, session))
    worded.push(...(await Promise.all(candidates.slice(1).map((candidate) => word(candidate, store, env, status, now, ai, session)))))
  }
  const batch = randomUUID()
  // The new batch replaces every draft still waiting: those can no longer be
  // approved (they may rest on older reports).
  const records = await store.transaction(async (tx) => {
    const superseded = await tx.supersedeDrafts(municipality)
    const records = await tx.insertAlerts(
      candidates.map((candidate, i) => ({
        municipality,
        barangay: candidate.barangay,
        audience: candidate.audience,
        epiWeek: candidate.facts.epiWeek,
        kind: candidate.kind,
        templateText: candidate.templateText,
        facts: candidate.facts,
        draftedBy: 'doh-view',
        batch,
        createdAt: now,
        ...worded[i],
      })),
    )
    const luna = records.filter((record) => record.source === 'luna').length
    await tx.audit({
      at: now,
      actor: 'doh-view',
      action: 'alerts-draft',
      detail: { municipality, alerts: records.length, luna, template: records.length - luna, superseded, ai: status.on ? 'on' : status.reason },
    })
    return records
  })
  // After the calls, so the day's count is current.
  return { ok: true, ai: await aiStatus(store, env, now), alerts: records.map(alertView) }
}

// GET /api/alerts: open drafts, decided alerts and the audit trail.
export async function listAlerts(store: Store, env: ServerEnv, municipality: string, now: Date): Promise<AlertsResponse> {
  const [drafts, decided, audit, ai] = await Promise.all([
    store.listAlerts(municipality, ['draft'], LIST_LIMIT),
    store.listAlerts(municipality, ['approved', 'rejected'], LIST_LIMIT),
    store.auditTrail(municipality, ALERT_ACTIONS, LIST_LIMIT),
    aiStatus(store, env, now),
  ])
  const auditViews: AuditView[] = audit.map((entry) => ({ at: entry.at.toISOString(), actor: entry.actor, action: entry.action, detail: entry.detail }))
  return { ok: true, ai, drafts: drafts.map(alertView), decided: decided.map(alertView), audit: auditViews }
}

const notOpen = (status: AlertRecord['status'] | undefined) =>
  status === 'superseded'
    ? new HttpError('superseded', 'A newer draft replaced this alert. Decide on the newer one.')
    : new HttpError('already-decided', 'This alert was already approved or rejected.')

// The alert, when it's this municipality's and still a draft. Another
// municipality's alert answers as if there were none.
async function draftOf(store: Store, id: string, municipality: string): Promise<AlertRecord> {
  const alert = await store.getAlert(id)
  if (!alert || alert.municipality !== municipality) throw new HttpError('not-found', 'No such alert.')
  if (alert.status !== 'draft') throw notOpen(alert.status)
  return alert
}

// When the decision found the alert no longer a draft (decided or superseded
// in the meantime), says which.
async function lostRace(store: Store, id: string): Promise<never> {
  throw notOpen((await store.getAlert(id))?.status)
}

// POST /api/alerts-approve: an edited wording gets back any safety caveat it
// left out, then is checked again against the alert's facts before it can be
// approved.
export async function approveAlert(
  store: Store,
  input: { id: string; municipality: string; role: string; text?: string },
  now: Date,
): Promise<DecideResponse> {
  const alert = await draftOf(store, input.id, input.municipality)
  const edited = input.text !== undefined && input.text.trim() !== alert.text.trim()
  const text = withCaveats(edited ? input.text!.trim() : alert.text, alert.kind)
  if (text !== alert.text) {
    const check = checkAlertText(text, { facts: alert.facts as AlertFacts, templateText: alert.templateText })
    if (!check.ok) throw new HttpError('check-failed', "The edited wording doesn't match the alert's facts.", {}, check.reasons)
  }
  const decided = (await store.decideAlert(alert.id, { status: 'approved', role: input.role, at: now, text })) ?? (await lostRace(store, alert.id))
  await store.audit({
    at: now,
    actor: input.role,
    action: 'alert-approved',
    detail: { municipality: alert.municipality, id: alert.id, kind: alert.kind, barangay: alert.barangay, source: alert.source, edited },
  })
  return { ok: true, alert: alertView(decided) }
}

// POST /api/alerts-reject.
export async function rejectAlert(store: Store, input: { id: string; municipality: string; role: string }, now: Date): Promise<DecideResponse> {
  const alert = await draftOf(store, input.id, input.municipality)
  const decided = (await store.decideAlert(alert.id, { status: 'rejected', role: input.role, at: now, text: alert.text })) ?? (await lostRace(store, alert.id))
  await store.audit({
    at: now,
    actor: input.role,
    action: 'alert-rejected',
    detail: { municipality: alert.municipality, id: alert.id, kind: alert.kind, barangay: alert.barangay, source: alert.source },
  })
  return { ok: true, alert: alertView(decided) }
}

const inboxAlert = (record: AlertRecord): InboxAlert => ({
  id: record.id,
  kind: record.kind,
  barangay: record.barangay,
  epiWeek: record.epiWeek,
  text: record.text,
  approvedAt: record.approvedAt!.toISOString(),
  approvedByRole: record.approvedByRole ?? '',
})

// POST /api/inbox, once the signature is checked: a laptop reads its
// municipality's approved alerts; a phone only those for its own barangay.
export async function readInbox(
  store: Store,
  scope: InboxResponse['scope'],
  now: Date,
): Promise<InboxResponse> {
  const alerts = await store.approvedAlerts(scope.municipality, scope.barangays, LIST_LIMIT)
  return { ok: true, scope, checkedAt: now.toISOString(), alerts: alerts.map(inboxAlert) }
}

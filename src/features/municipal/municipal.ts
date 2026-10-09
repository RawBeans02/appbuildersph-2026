import type { AgapayDb } from '../../data/db/db'
import type { Approval, PairedDevice, Plan, ReceivedPayload } from '../../data/db/types'
import { DEMO_MUNICIPALITY } from '../../data/places'
import { municipalSampleDevices, municipalSampleQrTexts } from '../../data/seed/municipal'
import { decodeQr, type QrPayloadV1 } from '../../qr'
import { buildPlan, type MunicipalPlan } from '../../rules/plan'
import { classifyScan, receivedPayloadId, registryOf, type ScanOutcome } from './scan/classify'
import { planShortSummary, planStepsText } from './steps'
import { noteScanned } from './justReceived'
import { noteApproved } from './log'

// The municipal laptop's records: paired phones, received QRs, plans and
// approvals, all in this browser's IndexedDB. Nothing here goes online.

// The demo laptop belongs to San Isidro Demo.
export const LAPTOP_MUNICIPALITY = DEMO_MUNICIPALITY.code
// A role, never a personal name.
export const APPROVER = 'Municipal health officer'
const LIST_LIMIT = 500

export type Handoff = { devices: PairedDevice[]; received: ReceivedPayload[] }

export async function readHandoff(db: AgapayDb): Promise<Handoff> {
  const [devices, received] = await Promise.all([
    db.pairedDevices.list({ limit: LIST_LIMIT }),
    db.receivedPayloads.list({ limit: LIST_LIMIT }),
  ])
  return { devices, received }
}

function toReceived(text: string, payload: QrPayloadV1, keyFingerprint: string, now: Date): ReceivedPayload {
  return {
    id: receivedPayloadId(payload),
    barangay: payload.barangay,
    municipality: payload.municipality,
    epiWeek: payload.epiWeek,
    seq: payload.seq,
    text,
    keyFingerprint,
    receivedAt: now.toISOString(),
  }
}

// Removes a barangay's received QRs that weren't signed by `fingerprint`.
async function dropOtherKeys(db: AgapayDb, received: readonly ReceivedPayload[], barangay: string, fingerprint: string) {
  for (const old of received) {
    if (old.barangay === barangay && old.keyFingerprint !== fingerprint) await db.receivedPayloads.delete(old.id)
  }
}

// First run: the four pre-made sample barangays (src/data/seed/municipal.ts)
// are paired and their QRs received, as if scanned. A barangay the officer
// has paired with a real phone is left alone. When the committed samples are
// regenerated (new keys, a new week), the old sample rows are swapped out.
// Returns whether it wrote anything.
export async function loadMunicipalSample(db: AgapayDb, now = new Date()): Promise<boolean> {
  const { devices, received } = await readHandoff(db)
  const registry = registryOf(municipalSampleDevices)
  let wrote = false
  for (const sample of municipalSampleDevices) {
    const current = devices.find((device) => device.barangay === sample.barangay)
    if (current && (current.source === 'pairing' || current.fingerprint === sample.fingerprint)) continue
    await db.pairedDevices.put({ ...sample, publicJwk: { ...sample.publicJwk }, pairedAt: now.toISOString() })
    await dropOtherKeys(db, received, sample.barangay, sample.fingerprint)
    for (const text of municipalSampleQrTexts) {
      const result = await decodeQr(text, registry)
      if (result.ok && result.payload.barangay === sample.barangay) {
        await db.receivedPayloads.put(toReceived(text, result.payload, result.keyFingerprint, now))
      }
    }
    wrote = true
  }
  return wrote
}

let sampleLoaded: Promise<boolean> | null = null

// loadMunicipalSample, once per page load.
export function ensureMunicipalSample(db: AgapayDb): Promise<boolean> {
  sampleLoaded ??= loadMunicipalSample(db)
  return sampleLoaded
}

// Classifies a scanned text and stores a new verified QR (replacing the
// barangay's older one). Pairing waits for the officer: see pairDevice.
export async function receiveScan(db: AgapayDb, text: string, now = new Date()): Promise<ScanOutcome> {
  const { devices, received } = await readHandoff(db)
  const outcome = await classifyScan(text, { municipality: LAPTOP_MUNICIPALITY, devices, received, now })
  if (outcome.kind === 'new') {
    await db.receivedPayloads.put(toReceived(outcome.text, outcome.payload, outcome.fingerprint, now))
    for (const old of outcome.replaces) await db.receivedPayloads.delete(old.id)
    noteScanned(receivedPayloadId(outcome.payload))
  }
  return outcome
}

// After the officer confirmed the fingerprints match. A new phone for a
// barangay replaces the old key, and QRs signed with the old key are removed.
export async function pairDevice(
  db: AgapayDb,
  outcome: Extract<ScanOutcome, { kind: 'pair' }>,
  now = new Date(),
): Promise<void> {
  const { barangay, publicJwk } = outcome.pairing
  await db.pairedDevices.put({ barangay, publicJwk, fingerprint: outcome.fingerprint, pairedAt: now.toISOString(), source: 'pairing' })
  const { received } = await readHandoff(db)
  await dropOtherKeys(db, received, barangay, outcome.fingerprint)
}

export type PlanInputs = {
  // Verified again on read, against the keys paired now.
  payloads: QrPayloadV1[]
  // Stored QRs that no longer verify (should not happen; shown, never used).
  unverified: ReceivedPayload[]
  sampleBarangays: Set<string>
}

export async function readPlanInputs(db: AgapayDb): Promise<PlanInputs> {
  const { devices, received } = await readHandoff(db)
  const registry = registryOf(devices)
  const payloads: QrPayloadV1[] = []
  const unverified: ReceivedPayload[] = []
  for (const item of received) {
    const result = await decodeQr(item.text, registry)
    if (result.ok) payloads.push(result.payload)
    else unverified.push(item)
  }
  const sampleBarangays = new Set(devices.filter((device) => device.source === 'seed').map((device) => device.barangay))
  return { payloads, unverified, sampleBarangays }
}

// What screens 18 and 19 read: the handoff and the plan built from the
// verified QRs (null before any barangay has sent counts).
export async function readMunicipalScreen(db: AgapayDb) {
  await ensureMunicipalSample(db)
  const [handoff, inputs] = await Promise.all([readHandoff(db), readPlanInputs(db)])
  const result = buildPlan(inputs.payloads, { sampleBarangays: inputs.sampleBarangays })
  return { handoff, plan: result.ok ? result.plan : null, unverified: inputs.unverified }
}

// One line for the approval log, from the computed plan (screen 20's Plan
// column).
export function planSummary(plan: MunicipalPlan): string {
  return planShortSummary(plan)
}

export type ApproveInput = {
  plan: MunicipalPlan
  draftText: string
  // Where the draft came from: the template (planTemplateText), or the optional
  // local model's rewording of it (B6).
  draftSource?: Plan['draftSource']
  // The officer's wording. Empty approves the plan as listed: the steps are
  // saved as the text ("Rules only" in the log).
  finalText: string
  note?: string
  now?: Date
}

// Saves the approved plan (rules, draft and final text) and logs the
// approval. The plan and its approval share one id. Returns it.
export async function approvePlan(db: AgapayDb, input: ApproveInput): Promise<string> {
  const wording = input.finalText.trim()
  const finalText = wording || planStepsText(input.plan)
  const draftSource = wording ? (input.draftSource ?? 'template') : 'template'
  const now = input.now ?? new Date()
  const at = now.toISOString()
  const id = `plan-${at}-${crypto.randomUUID().slice(0, 8)}`
  const plan: Plan = {
    id,
    epiWeek: input.plan.epiWeek,
    createdAt: at,
    rules: input.plan,
    draftText: wording ? input.draftText : null,
    draftSource,
    finalText,
    status: 'approved',
  }
  const approval: Approval = {
    id,
    approvedAt: at,
    approver: APPROVER,
    planSummary: planSummary(input.plan),
    note: (input.note ?? '').trim(),
    sample: false,
  }
  await db.plans.put(plan)
  await db.approvals.put(approval)
  noteApproved(id)
  return id
}

export type LogEntry = { approval: Approval; plan: Plan | null }

export async function readApprovalLog(db: AgapayDb): Promise<LogEntry[]> {
  const [approvals, plans] = await Promise.all([db.approvals.list({ limit: LIST_LIMIT }), db.plans.list({ limit: LIST_LIMIT })])
  const byId = new Map(plans.map((plan) => [plan.id, plan]))
  return approvals
    .map((approval) => ({ approval, plan: byId.get(approval.id) ?? null }))
    .sort((a, b) => (a.approval.approvedAt < b.approval.approvedAt ? 1 : a.approval.approvedAt > b.approval.approvedAt ? -1 : 0))
}

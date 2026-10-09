import type { AgapayDb } from '../../data/db/db'
import { encodeReturn, type ReturnAction, type ReturnPacket } from '../../qr/return'
import { firstPriority } from '../municipal/merged'
import { storedPlan } from '../municipal/log'
import { APPROVER } from '../municipal/municipal'
import type { SyncStore } from '../municipal/sync/syncStore'

export async function readReturnApproval(db: AgapayDb, id: string) {
  const [approval, saved] = await Promise.all([db.approvals.get(id), db.plans.get(id)])
  const plan = storedPlan(saved?.rules)
  if (!approval || !saved || saved.status !== 'approved' || !plan || approval.approver !== APPROVER || saved.epiWeek !== plan.epiWeek) throw new Error('A saved, approved structured plan is required.')
  return { approval, plan }
}

export function actionsFor(plan: NonNullable<ReturnType<typeof storedPlan>>, barangay: string): ReturnAction[] {
  const actions: ReturnAction[] = []
  const first = firstPriority(plan)
  if (first?.row.barangay === barangay) actions.push({ kind: 'doctor-team', barangay, watchCount: first.row.counts.inWatchWindow })
  for (const move of plan.moves) if (move.from === barangay || move.to === barangay) actions.push({ kind: 'stock-transfer', from: move.from, to: move.to, capsules: move.capsulesUpTo })
  return actions
}

export async function makeReturnQr(db: AgapayDb, store: SyncStore, id: string, barangay: string) {
  const { approval, plan } = await readReturnApproval(db, id)
  const identity = await store.ensureIdentity()
  const packet: ReturnPacket = { version: 1, approvalId: id, municipality: plan.municipality, barangay, epiWeek: plan.epiWeek, approvedAt: approval.approvedAt, approver: APPROVER, actions: actionsFor(plan, barangay), publicJwk: identity.publicJwk }
  return { packet, fingerprint: identity.fingerprint, text: await encodeReturn(packet, identity.privateKey) }
}

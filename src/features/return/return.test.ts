import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { openAgapayDb, type AgapayDb } from '../../data/db/db'
import { encodeReturn, decodeReturn, validReturnPacket, type ReturnPacket } from '../../qr/return'
import { fromBase64url, toBase64url } from '../../qr/codec'
import { generateDeviceKeyPair, signBytes } from '../../qr/sign'
import { openSyncStore, type SyncStore } from '../municipal/sync/syncStore'
import { approvePlan } from '../municipal/municipal'
import { payload, planOf } from '../municipal/testSample'
import { previewReceipt, saveReceipt } from './receipt'
import { actionsFor, makeReturnQr } from './sender'

let count = 0
const opened: (AgapayDb | SyncStore)[] = []
afterEach(() => { opened.splice(0).forEach((db) => db.close()) })
async function setup() {
  const name = `return-test-${++count}`
  const db = await openAgapayDb(name)
  opened.push(db)
  await db.loadSeed({ version: 'return-test', municipality: 'San Isidro Demo', barangay: 'Maligaya-D', residents: [] })
  const keys = await generateDeviceKeyPair()
  const packet: ReturnPacket = { version: 1, approvalId: 'plan-test', municipality: 'SID', barangay: 'SID-MAL', epiWeek: '2026-W41', approvedAt: '2026-10-09T08:00:00.000Z', approver: 'Municipal health officer', actions: [{ kind: 'doctor-team', barangay: 'SID-MAL', watchCount: '<5' }, { kind: 'stock-transfer', from: 'SID-RIV', to: 'SID-MAL', capsules: 30 }], publicJwk: keys.publicJwk }
  const text = await encodeReturn(packet, keys.privateKey)
  return { db, name, keys, packet, text }
}

describe('signed return packets', () => {
  it('round trips canonical instructions and preserves suppressed cells within one QR', async () => {
    const { packet, text } = await setup()
    expect(text.startsWith('AGPR1.')).toBe(true)
    expect(text.length).toBeLessThan(900)
    expect((await decodeReturn(text, 'SID', 'SID-MAL')).packet).toEqual(packet)
  })
  it('rejects invalid signatures, unsupported versions and wrong recipients', async () => {
    const { text, packet } = await setup()
    const other = await generateDeviceKeyPair()
    await expect(decodeReturn(await encodeReturn(packet, other.privateKey), 'SID', 'SID-MAL')).rejects.toThrow('signature')
    await expect(decodeReturn(text.replace('AGPR1.', 'AGPR2.'), 'SID', 'SID-MAL')).rejects.toThrow('unsupported')
    await expect(decodeReturn(text, 'SID', 'SID-RIV')).rejects.toThrow('another barangay')
    await expect(decodeReturn(text, 'XYZ', 'XYZ-MAL')).rejects.toThrow('another barangay')
  })
  it('rejects malformed input without throwing parser details or echoing its contents', async () => {
    for (const text of ['hello secret patient', 'AGPR1.?.?', 'AGPR1.A.A', 'AGPR1.' + 'A'.repeat(2100)]) {
      await expect(decodeReturn(text, 'SID', 'SID-MAL')).rejects.toThrow()
    }
  })
  it('rejects noncanonical signed JSON, unknown fields, hidden text and unsuppressed counts', async () => {
    const { packet, text, keys } = await setup()
    expect(validReturnPacket({ ...packet, patientName: 'secret' })).toBe(false)
    expect(validReturnPacket({ ...packet, actions: [{ kind: 'doctor-team', barangay: 'SID-MAL', watchCount: 3 }] })).toBe(false)
    expect(validReturnPacket({ ...packet, actions: [{ kind: 'stock-transfer', from: 'SID-BGS', to: 'SID-STN', capsules: 30 }] })).toBe(false)
    expect(validReturnPacket({ ...packet, actions: [{ kind: 'stock-transfer', from: 'SID-RIV', to: 'SID-MAL', capsules: 0 }] })).toBe(false)
    expect(validReturnPacket({ ...packet, approvedAt: 'yesterday' })).toBe(false)
    expect(validReturnPacket({ ...packet, actions: [] })).toBe(false)
    const wire = JSON.parse(new TextDecoder().decode(fromBase64url(text.split('.')[1])!)) as unknown
    const signed = 'AGPR1.' + toBase64url(new TextEncoder().encode(JSON.stringify(wire, null, 2)))
    const noncanonical = signed + '.' + toBase64url(await signBytes(keys.privateKey, new TextEncoder().encode(signed)))
    await expect(decodeReturn(noncanonical, 'SID', 'SID-MAL')).rejects.toThrow('malformed')
  })
})

describe('receipt, trust and reset', () => {
  it('requires fingerprint comparison before first save; preview makes no writes', async () => {
    const { db, text } = await setup()
    const preview = await previewReceipt(db, text)
    expect(preview.needsTrust).toBe(true)
    expect(await db.getMunicipalTrust()).toEqual([])
    expect(await db.getReceivedInstructions()).toBeNull()
    await expect(saveReceipt(db, preview, false)).rejects.toThrow('Compare')
    expect(await db.getMunicipalTrust()).toEqual([])
    expect(await saveReceipt(db, preview, true)).toBe('saved')
    expect(await db.getMunicipalTrust()).toHaveLength(1)
    expect((await previewReceipt(db, text)).needsTrust).toBe(false)
  })
  it('persists through reload and never changes stock or approvals', async () => {
    const { db, name, text } = await setup()
    const before = { stock: await db.stockLots.list(), approvals: await db.approvals.list() }
    await saveReceipt(db, await previewReceipt(db, text), true)
    db.close()
    const reopened = await openAgapayDb(name)
    opened.push(reopened)
    expect((await reopened.getReceivedInstructions())?.text).toBe(text)
    expect(await reopened.getMunicipalTrust()).toHaveLength(1)
    expect(await reopened.stockLots.list()).toEqual(before.stock)
    expect(await reopened.approvals.list()).toEqual(before.approvals)
  })
  it('rejects changed keys at preview and again after a concurrent trust change', async () => {
    const { db, text, packet } = await setup()
    const keys = await generateDeviceKeyPair()
    const changedText = await encodeReturn({ ...packet, publicJwk: keys.publicJwk }, keys.privateKey)
    const changedPreview = await previewReceipt(db, changedText)
    await saveReceipt(db, await previewReceipt(db, text), true)
    await expect(previewReceipt(db, changedText)).rejects.toThrow('key changed')
    await expect(saveReceipt(db, changedPreview, true)).rejects.toThrow('key changed')
    expect((await db.getReceivedInstructions())?.text).toBe(text)
  })
  it('makes duplicates idempotent, including a new signature for the same approval', async () => {
    const { db, text, packet, keys } = await setup()
    const preview = await previewReceipt(db, text)
    await saveReceipt(db, preview, true, new Date('2026-10-09T09:00:00.000Z'))
    const before = await db.getReceivedInstructions()
    expect(await saveReceipt(db, await previewReceipt(db, await encodeReturn(packet, keys.privateKey)), false)).toBe('duplicate')
    expect(await db.getReceivedInstructions()).toEqual(before)
  })
  it('rejects stale, equal-time conflicting and reused approval IDs; accepts newer approvals', async () => {
    const { db, text, packet, keys } = await setup()
    await saveReceipt(db, await previewReceipt(db, text), true)
    for (const change of [{ approvalId: 'old', approvedAt: '2026-10-08T08:00:00.000Z' }, { approvalId: 'conflict' }, { actions: [{ kind: 'doctor-team' as const, barangay: 'SID-MAL', watchCount: 10 }] }]) {
      const preview = await previewReceipt(db, await encodeReturn({ ...packet, ...change }, keys.privateKey))
      await expect(saveReceipt(db, preview, false)).rejects.toThrow()
    }
    const newer = await previewReceipt(db, await encodeReturn({ ...packet, approvalId: 'new', approvedAt: '2026-10-10T08:00:00.000Z' }, keys.privateKey))
    expect(await saveReceipt(db, newer, false)).toBe('saved')
    expect((await db.getReceivedInstructions())?.packet.approvalId).toBe('new')
  })
  it('serializes concurrent old/new receipts and keeps the newest', async () => {
    const { db, text, packet, keys } = await setup()
    const old = await previewReceipt(db, text)
    const newer = await previewReceipt(db, await encodeReturn({ ...packet, approvalId: 'new', approvedAt: '2026-10-10T08:00:00.000Z' }, keys.privateKey))
    await Promise.allSettled([saveReceipt(db, newer, true), saveReceipt(db, old, true)])
    expect((await db.getReceivedInstructions())?.packet.approvalId).toBe('new')
  })
  it('clears instructions on sample reset, and also trust on pairing reset', async () => {
    const { db, text } = await setup()
    await saveReceipt(db, await previewReceipt(db, text), true)
    await db.clearForReset({ resetPairing: false })
    expect(await db.getReceivedInstructions()).toBeNull()
    expect(await db.getMunicipalTrust()).toHaveLength(1)
    await db.clearForReset({ resetPairing: true })
    expect(await db.getMunicipalTrust()).toEqual([])
  })
})

describe('saved approval sender', () => {
  it('sends only relevant approved actions, independently of cloud enrollment', async () => {
    const { db } = await setup()
    const store = await openSyncStore(`return-sync-${count}`)
    opened.push(store)
    const plan = planOf([payload('SID-MAL', { inWatchWindow: 9 }), payload('SID-BGS', { inWatchWindow: 6 }), payload('SID-RIV', { doxyCapsulesOnHand: 50, doxyCapsulesExpiring6w: 30 })])
    expect(actionsFor(plan, 'SID-MAL')).toHaveLength(2)
    expect(actionsFor(plan, 'SID-RIV')).toHaveLength(1)
    expect(actionsFor(plan, 'SID-BGS')).toEqual([])
    const id = await approvePlan(db, { plan, draftText: '', finalText: 'Edited wording never enters the QR.', now: new Date('2026-10-09T08:00:00.000Z') })
    const qr = await makeReturnQr(db, store, id, 'SID-MAL')
    expect((await decodeReturn(qr.text, 'SID', 'SID-MAL')).packet.actions).toEqual(actionsFor(plan, 'SID-MAL'))
    expect(await store.getEnrollment()).toBeNull()
    const fingerprint = qr.fingerprint
    expect((await makeReturnQr(db, store, id, 'SID-RIV')).fingerprint).toBe(fingerprint)
    await expect(makeReturnQr(db, store, 'missing', 'SID-MAL')).rejects.toThrow('saved')
    await db.approvals.delete(id)
    await expect(makeReturnQr(db, store, id, 'SID-MAL')).rejects.toThrow('saved')
  })
})

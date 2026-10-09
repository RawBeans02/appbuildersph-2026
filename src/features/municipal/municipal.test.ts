import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openAgapayDb } from '../../data/db/db'
import { municipalSampleDevices } from '../../data/seed/municipal'
import { createPayload, encodePairing, encodeQr, generateDeviceKeyPair, type RawCounts } from '../../qr'
import { buildPlan } from '../../rules/plan'
import {
  approvePlan,
  loadMunicipalSample,
  pairDevice,
  planSummary,
  readApprovalLog,
  readHandoff,
  readPlanInputs,
  receiveScan,
} from './municipal'

let dbCount = 0
const freshDb = () => openAgapayDb(`municipal-test-${++dbCount}`)
const NOW = new Date('2026-10-09T08:30:00.000Z')

const MALIGAYA: RawCounts = {
  exposed: { under2m: 0, m2to12: 1, y1to5: 1, y5to17: 3, y18to59: 6, y60plus: 1 },
  inWatchWindow: 9,
  fastBreathing: { under2m: 0, m2to12: 0, y1to5: 2 },
  urgentReferrals: 0,
  doxyCapsulesOnHand: 40,
  doxyCapsulesExpiring6w: 30,
  clinicianReviewFlags: 1,
}

async function livePhone(barangay = 'SID-MAL') {
  const keys = await generateDeviceKeyPair()
  return {
    pairingText: encodePairing({ barangay, municipality: 'SID', publicJwk: keys.publicJwk }),
    countsQr: (seq: number, epiWeek = '2026-W41') =>
      encodeQr(createPayload({ municipality: 'SID', barangay, epiWeek, seq, counts: MALIGAYA }), keys.privateKey),
  }
}

async function pairLive(db: Awaited<ReturnType<typeof freshDb>>, phone: Awaited<ReturnType<typeof livePhone>>) {
  const outcome = await receiveScan(db, phone.pairingText, NOW)
  if (outcome.kind !== 'pair') throw new Error(`expected a pairing prompt, got ${outcome.kind}`)
  await pairDevice(db, outcome, NOW)
}

describe('the sample barangays on first run', () => {
  it('pairs the four pre-made barangays and receives their QRs, labeled as seed, once', async () => {
    const db = await freshDb()
    expect(await loadMunicipalSample(db, NOW)).toBe(true)
    const { devices, received } = await readHandoff(db)
    expect(devices.map((device) => [device.barangay, device.source]).sort()).toEqual([
      ['SID-BGS', 'seed'],
      ['SID-MAB', 'seed'],
      ['SID-RIV', 'seed'],
      ['SID-STN', 'seed'],
    ])
    expect(received).toHaveLength(4)
    expect(await loadMunicipalSample(db, NOW)).toBe(false)
    expect((await readHandoff(db)).received).toHaveLength(4)
    const inputs = await readPlanInputs(db)
    expect(inputs.payloads).toHaveLength(4)
    expect([...inputs.sampleBarangays].sort()).toEqual(['SID-BGS', 'SID-MAB', 'SID-RIV', 'SID-STN'])
    db.close()
  })

  it('swaps out sample rows from an older committed sample (regenerated keys)', async () => {
    const db = await freshDb()
    const old = municipalSampleDevices[0]
    const stale = await livePhone(old.barangay)
    // Pretend an earlier sample paired SID-BGS with another key and left a QR from it.
    await pairLive(db, stale)
    const staleDevice = await db.pairedDevices.get(old.barangay)
    await db.pairedDevices.put({ ...staleDevice!, source: 'seed' })
    await receiveScan(db, await stale.countsQr(7), NOW)
    expect((await readHandoff(db)).received.map((item) => item.seq)).toEqual([7])

    await loadMunicipalSample(db, NOW)
    expect((await db.pairedDevices.get(old.barangay))?.fingerprint).toBe(old.fingerprint)
    const bgs = (await readHandoff(db)).received.filter((item) => item.barangay === old.barangay)
    expect(bgs.map((item) => item.keyFingerprint)).toEqual([old.fingerprint])
    db.close()
  })

  it('leaves a barangay alone once the officer paired a real phone for it', async () => {
    const db = await freshDb()
    await loadMunicipalSample(db, NOW)
    const realPhone = await livePhone('SID-RIV')
    await pairLive(db, realPhone)
    // The sample QR signed by the sample key is gone with the old key.
    expect((await readHandoff(db)).received.some((item) => item.barangay === 'SID-RIV')).toBe(false)
    expect(await loadMunicipalSample(db, NOW)).toBe(false)
    expect((await db.pairedDevices.get('SID-RIV'))?.source).toBe('pairing')
    db.close()
  })
})

describe('receiving the live phone', () => {
  it('pairs Maligaya-D after the fingerprint check, then receives its counts and merges five barangays', async () => {
    const db = await freshDb()
    await loadMunicipalSample(db, NOW)
    const phone = await livePhone()

    expect((await receiveScan(db, await phone.countsQr(1), NOW)).kind).toBe('invalid') // not paired yet
    await pairLive(db, phone)
    expect((await receiveScan(db, phone.pairingText, NOW)).kind).toBe('already-paired')

    const outcome = await receiveScan(db, await phone.countsQr(1), NOW)
    expect(outcome.kind).toBe('new')
    expect(await db.receivedPayloads.get('SID-MAL:2026-W41:1')).toMatchObject({ seq: 1, receivedAt: NOW.toISOString() })

    const inputs = await readPlanInputs(db)
    expect(inputs.unverified).toEqual([])
    const result = buildPlan(inputs.payloads, { sampleBarangays: inputs.sampleBarangays })
    if (!result.ok) throw new Error(result.code)
    expect(result.plan.rows.map((row) => [row.name, row.sample])).toEqual([
      ['Bagong Silang-D', true],
      ['Mabini-D', true],
      ['Maligaya-D', false],
      ['Riverside-D', true],
      ['Santo Niño-D', true],
    ])
    expect(result.plan.priority[0].name).toBe('Bagong Silang-D')
    db.close()
  })

  it('replaces an older export with a newer one, and keeps a newer one over an older scan', async () => {
    const db = await freshDb()
    const phone = await livePhone()
    await pairLive(db, phone)
    await receiveScan(db, await phone.countsQr(2), NOW)
    expect((await receiveScan(db, await phone.countsQr(3), NOW)).kind).toBe('new')
    expect((await readHandoff(db)).received.map((item) => item.id)).toEqual(['SID-MAL:2026-W41:3'])
    expect((await receiveScan(db, await phone.countsQr(2), NOW)).kind).toBe('older')
    expect((await receiveScan(db, await phone.countsQr(3), NOW)).kind).toBe('already-received')
    expect((await readHandoff(db)).received.map((item) => item.id)).toEqual(['SID-MAL:2026-W41:3'])
    db.close()
  })
})

describe('approval', () => {
  it('saves the plan and logs the approval under one id, newest first', async () => {
    const db = await freshDb()
    await loadMunicipalSample(db, NOW)
    const inputs = await readPlanInputs(db)
    const result = buildPlan(inputs.payloads, { sampleBarangays: inputs.sampleBarangays })
    if (!result.ok) throw new Error(result.code)
    const plan = result.plan

    const first = await approvePlan(db, { plan, draftText: 'Draft', finalText: 'Draft', note: '', now: NOW })
    const later = new Date(NOW.getTime() + 60_000)
    const second = await approvePlan(db, {
      plan,
      draftText: 'Draft',
      draftSource: 'llm',
      finalText: 'Draft, edited ',
      note: ' Call RHU ',
      now: later,
    })

    const log = await readApprovalLog(db)
    expect(log.map((entry) => entry.approval.id)).toEqual([second, first])
    expect(log[0].approval).toMatchObject({
      approver: 'Municipal health officer',
      note: 'Call RHU',
      sample: false,
      approvedAt: later.toISOString(),
    })
    expect(log[0].approval.planSummary).toContain('Text edited by the officer.')
    expect(log[1].approval.planSummary).not.toContain('edited')
    expect(log[0].plan).toMatchObject({ status: 'approved', finalText: 'Draft, edited', draftSource: 'llm', epiWeek: '2026-W41' })
    expect(log[1].plan?.draftSource).toBe('template')
    expect(log[0].plan?.rules).toEqual(plan)
    await expect(approvePlan(db, { plan, draftText: 'Draft', finalText: '  ', note: '' })).rejects.toThrow('empty')
    db.close()
  })

  it('summarizes the computed plan in one line', async () => {
    const db = await freshDb()
    await loadMunicipalSample(db, NOW)
    const inputs = await readPlanInputs(db)
    const result = buildPlan(inputs.payloads, { sampleBarangays: inputs.sampleBarangays })
    if (!result.ok) throw new Error(result.code)
    expect(planSummary(result.plan, false)).toBe(
      'Week 2026-W41, 4 barangays. Doctor teams: 1. Bagong Silang-D, 2. Santo Niño-D, 3. Mabini-D, 4. Riverside-D. ' +
        'Doxycycline: Riverside-D to Bagong Silang-D, up to 30 capsules. Includes sample data (4 barangays).',
    )
    db.close()
  })
})

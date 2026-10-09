import { describe, expect, it } from 'vitest'
import { createPayload, decodeQr, keyFingerprint, type KeyRegistry, type QrPayloadV1 } from '../../qr'
import { buildPlan } from '../../rules/plan'
import { DEMO_BARANGAYS, DEMO_MUNICIPALITY } from '../places'
import { MUNICIPAL_SAMPLE_EPI_WEEK, municipalSampleDevices, municipalSampleQrTexts } from './municipal'
import { generateMunicipalSample, renderMunicipalSampleModule, SAMPLE_BARANGAYS } from './municipalSource'

const registry: KeyRegistry = Object.fromEntries(municipalSampleDevices.map((device) => [device.barangay, device.publicJwk]))

async function committedPayloads(): Promise<QrPayloadV1[]> {
  const results = await Promise.all(municipalSampleQrTexts.map((text) => decodeQr(text, registry)))
  return results.map((result) => {
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`)
    return result.payload
  })
}

describe('the committed pre-made barangay QRs (src/data/seed/municipal.ts)', () => {
  it('are four signed QRs that verify against their committed public keys', async () => {
    expect(municipalSampleQrTexts).toHaveLength(4)
    const payloads = await committedPayloads()
    expect(payloads.map((payload) => payload.barangay)).toEqual(['SID-BGS', 'SID-STN', 'SID-MAB', 'SID-RIV'])
  })

  it('are the demo places other than the live phone (Maligaya-D arrives by pairing)', async () => {
    const codes = municipalSampleDevices.map((device) => device.barangay)
    const demoCodes = DEMO_BARANGAYS.map((place) => place.code)
    expect(codes.every((code) => demoCodes.includes(code))).toBe(true)
    expect(codes).not.toContain('SID-MAL')
    for (const payload of await committedPayloads()) {
      expect(payload.municipality).toBe(DEMO_MUNICIPALITY.code)
      expect(payload.epiWeek).toBe(MUNICIPAL_SAMPLE_EPI_WEEK)
    }
  })

  it('carry exactly the counts in municipalSource.ts, suppressed', async () => {
    const payloads = await committedPayloads()
    for (const source of SAMPLE_BARANGAYS) {
      const expected = createPayload({
        municipality: 'SID',
        barangay: source.code,
        epiWeek: MUNICIPAL_SAMPLE_EPI_WEEK,
        seq: source.seq,
        counts: source.counts,
      })
      expect(payloads.find((payload) => payload.barangay === source.code)).toEqual(expected)
    }
  })

  it('keep only public keys, as pairedDevices seed rows with matching fingerprints', async () => {
    for (const device of municipalSampleDevices) {
      expect(Object.keys(device.publicJwk).sort()).toEqual(['crv', 'kty', 'x', 'y'])
      expect(device.source).toBe('seed')
      expect(device.fingerprint).toBe(await keyFingerprint(device.publicJwk))
    }
    expect(new Set(municipalSampleDevices.map((device) => device.fingerprint)).size).toBe(4)
  })

  it('verify only with their own barangay\'s key', async () => {
    const [first, second] = municipalSampleDevices
    const swapped: KeyRegistry = { [first.barangay]: second.publicJwk }
    const result = await decodeQr(municipalSampleQrTexts[0], swapped)
    expect(result).toMatchObject({ ok: false, code: 'bad-signature' })
  })

  it('make Bagong Silang-D clearly the priority and Riverside-D the source of a doxycycline move', async () => {
    const result = buildPlan(await committedPayloads())
    if (!result.ok) throw new Error(result.code)
    const [first, ...rest] = result.plan.priority
    expect(first.name).toBe('Bagong Silang-D')
    for (const other of rest) expect(first.score.min).toBeGreaterThan(other.score.max)
    expect(result.plan.moves.map((move) => [move.fromName, move.toName, move.capsulesUpTo])).toEqual([
      ['Riverside-D', 'Bagong Silang-D', 30],
    ])
  })

  it('keep the story with the live phone added (Maligaya-D as its seed would send it)', async () => {
    const maligaya = createPayload({
      municipality: 'SID',
      barangay: 'SID-MAL',
      epiWeek: MUNICIPAL_SAMPLE_EPI_WEEK,
      seq: 1,
      counts: {
        exposed: { under2m: 0, m2to12: 1, y1to5: 1, y5to17: 3, y18to59: 6, y60plus: 1 },
        inWatchWindow: 9,
        fastBreathing: { under2m: 0, m2to12: 0, y1to5: 2 },
        urgentReferrals: 0,
        doxyCapsulesOnHand: 40,
        doxyCapsulesExpiring6w: 30,
        clinicianReviewFlags: 1,
      },
    })
    const result = buildPlan([...(await committedPayloads()), maligaya])
    if (!result.ok) throw new Error(result.code)
    expect(result.plan.priority[0].name).toBe('Maligaya-D')
    expect(result.plan.rows).toHaveLength(5)
    expect(result.plan.moves.map((move) => [move.fromName, move.toName, move.capsulesUpTo])).toEqual([['Riverside-D', 'Maligaya-D', 30]])
  })
})

describe('the generator (npm run seed:municipal)', () => {
  it('signs fresh QRs for any week, and writes only public keys and QR texts', async () => {
    const sample = await generateMunicipalSample('2026-W42')
    const freshRegistry: KeyRegistry = Object.fromEntries(sample.devices.map((device) => [device.barangay, device.publicJwk]))
    for (const text of sample.qrTexts) {
      const result = await decodeQr(text, freshRegistry)
      expect(result.ok && result.payload.epiWeek).toBe('2026-W42')
    }
    const module = renderMunicipalSampleModule(sample)
    expect(module).toContain("export const MUNICIPAL_SAMPLE_EPI_WEEK = '2026-W42'")
    for (const text of sample.qrTexts) expect(module).toContain(`'${text}'`)
    expect(module).not.toMatch(/\bd: '/)
  })
})

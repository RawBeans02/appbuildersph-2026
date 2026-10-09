import { beforeAll, describe, expect, it } from 'vitest'
import type { PairedDevice, ReceivedPayload } from '../../../data/db/types'
import {
  createPayload,
  encodePairing,
  encodeQr,
  generateDeviceKeyPair,
  keyFingerprint,
  type DeviceKeyPair,
  type RawCounts,
} from '../../../qr'
import { classifyScan, compareExports, describeOutcome, receivedPayloadId, type ScanContext, type ScanOutcome } from './classify'

const COUNTS: RawCounts = {
  exposed: { under2m: 0, m2to12: 1, y1to5: 1, y5to17: 3, y18to59: 6, y60plus: 1 },
  inWatchWindow: 9,
  fastBreathing: { under2m: 0, m2to12: 0, y1to5: 2 },
  urgentReferrals: 0,
  doxyCapsulesOnHand: 40,
  doxyCapsulesExpiring6w: 30,
  clinicianReviewFlags: 1,
}

let phone: DeviceKeyPair
let otherPhone: DeviceKeyPair
let paired: PairedDevice

beforeAll(async () => {
  ;[phone, otherPhone] = await Promise.all([generateDeviceKeyPair(), generateDeviceKeyPair()])
  paired = {
    barangay: 'SID-MAL',
    publicJwk: phone.publicJwk,
    fingerprint: await keyFingerprint(phone.publicJwk),
    pairedAt: '2026-10-09T08:00:00.000Z',
    source: 'pairing',
  }
})

function countsQr(options: { seq?: number; week?: string; key?: CryptoKey; barangay?: string } = {}) {
  const payload = createPayload({
    municipality: 'SID',
    barangay: options.barangay ?? 'SID-MAL',
    epiWeek: options.week ?? '2026-W41',
    seq: options.seq ?? 3,
    counts: COUNTS,
  })
  return encodeQr(payload, options.key ?? phone.privateKey)
}

function stored(text: string, seq: number, week = '2026-W41'): ReceivedPayload {
  return {
    id: receivedPayloadId({ barangay: 'SID-MAL', epiWeek: week, seq }),
    barangay: 'SID-MAL',
    municipality: 'SID',
    epiWeek: week,
    seq,
    text,
    keyFingerprint: paired.fingerprint,
    receivedAt: '2026-10-09T09:00:00.000Z',
  }
}

// The demo: Saturday Oct 10, 2026, 09:00 in Manila (week 2026-W41). Never today's date.
const NOW = new Date('2026-10-10T01:00:00.000Z')

const context = (overrides: Partial<ScanContext> = {}): ScanContext => ({
  municipality: 'SID',
  devices: [paired],
  received: [],
  now: NOW,
  ...overrides,
})

function expectKind<K extends ScanOutcome['kind']>(outcome: ScanOutcome, kind: K): Extract<ScanOutcome, { kind: K }> {
  expect(outcome.kind).toBe(kind)
  return outcome as Extract<ScanOutcome, { kind: K }>
}

describe('counts QRs', () => {
  it('accepts a verified QR from a paired phone', async () => {
    const text = await countsQr()
    const outcome = expectKind(await classifyScan(`${text}\n`, context()), 'new')
    expect(outcome.text).toBe(text)
    expect(outcome.payload).toMatchObject({ barangay: 'SID-MAL', seq: 3, epiWeek: '2026-W41' })
    expect(outcome.fingerprint).toBe(paired.fingerprint)
    expect(outcome.replaces).toEqual([])
    expect(describeOutcome(outcome)).toBe(
      'Received Maligaya-D, export 3, week 2026-W41: 9 in the watch window. Signature checked.',
    )
  })

  it('says "already received" for the same export, even re-signed', async () => {
    const first = await countsQr()
    const again = await countsQr() // ECDSA signatures differ each time; the export is the same
    expect(again).not.toBe(first)
    const outcome = expectKind(await classifyScan(again, context({ received: [stored(first, 3)] })), 'already-received')
    expect(describeOutcome(outcome)).toBe('Already received: Maligaya-D, export 3, week 2026-W41. Nothing changed.')
  })

  it('lets a newer seq replace an older one', async () => {
    const old = stored(await countsQr({ seq: 2 }), 2)
    const outcome = expectKind(await classifyScan(await countsQr({ seq: 3 }), context({ received: [old] })), 'new')
    expect(outcome.replaces).toEqual([old])
    expect(describeOutcome(outcome)).toContain('It replaces export 2, week 2026-W41.')
  })

  it('lets a later week replace an earlier one, whatever the seq', async () => {
    const old = stored(await countsQr({ seq: 9, week: '2026-W40' }), 9, '2026-W40')
    const outcome = expectKind(await classifyScan(await countsQr({ seq: 1 }), context({ received: [old] })), 'new')
    expect(outcome.replaces).toEqual([old])
  })

  it('keeps the newer one when an older QR is scanned', async () => {
    const newer = stored(await countsQr({ seq: 5 }), 5)
    const outcome = expectKind(await classifyScan(await countsQr({ seq: 4 }), context({ received: [newer] })), 'older')
    expect(outcome.newest).toBe(newer)
    expect(describeOutcome(outcome)).toBe(
      'Older than the one you have: Maligaya-D export 4, week 2026-W41. Kept export 5, week 2026-W41.',
    )
  })

  it('refuses a QR signed by another phone, naming the barangay', async () => {
    const outcome = expectKind(await classifyScan(await countsQr({ key: otherPhone.privateKey }), context()), 'invalid')
    expect(outcome).toMatchObject({ source: 'counts', code: 'bad-signature', barangay: 'SID-MAL' })
    expect(describeOutcome(outcome)).toContain('does not match the phone paired for Maligaya-D')
  })

  it('asks for pairing first when the barangay has no paired phone', async () => {
    const outcome = expectKind(await classifyScan(await countsQr(), context({ devices: [] })), 'invalid')
    expect(outcome.code).toBe('unknown-device')
    expect(describeOutcome(outcome)).toBe(
      "No phone is paired for Maligaya-D yet. Scan the pairing QR on that phone's Send screen first, then its counts QR.",
    )
  })

  it('has a clear message for every other decode error', async () => {
    const text = await countsQr()
    const cases: [string, string, string][] = [
      ['https://example.com', 'not-agapay', "This is not an AgapayMo QR code. Scan the QR on the barangay phone's Send screen."],
      [text.replace(/^AGP1\./, 'AGP2.'), 'bad-version', 'This QR is from a different version of AgapayMo.'],
      [`AGP1.e30.${text.split('.')[2]}`, 'invalid-payload', 'it is damaged or was changed'],
    ]
    for (const [input, code, message] of cases) {
      const outcome = expectKind(await classifyScan(input, context()), 'invalid')
      expect(outcome.code).toBe(code)
      expect(describeOutcome(outcome)).toContain(message)
    }
  })
})

describe('the report week (a phone with its date set wrong)', () => {
  it('refuses a far-future week before it can replace anything, and says to check the phone', async () => {
    const current = stored(await countsQr({ seq: 3 }), 3)
    const outcome = expectKind(await classifyScan(await countsQr({ seq: 1, week: '2099-W01' }), context({ received: [current] })), 'invalid')
    expect(outcome).toMatchObject({
      source: 'counts',
      code: 'week-out-of-range',
      barangay: 'SID-MAL',
      epiWeek: '2099-W01',
      fingerprint: paired.fingerprint,
    })
    expect(describeOutcome(outcome)).toBe(
      "This report's week (2099-W01) is not this week or the last 8 weeks. Check the date on the phone, then make the QR again. Nothing was saved.",
    )
  })

  it('lets a real report replace a far-future one stored before this check', async () => {
    const future = stored(await countsQr({ seq: 1, week: '2099-W01' }), 1, '2099-W01')
    const outcome = expectKind(await classifyScan(await countsQr({ seq: 2 }), context({ received: [future] })), 'new')
    expect(outcome.replaces).toEqual([future])
  })

  it('accepts this week, and a week 8 weeks back', async () => {
    expect((await classifyScan(await countsQr({ week: '2026-W41' }), context())).kind).toBe('new')
    expect((await classifyScan(await countsQr({ week: '2026-W33' }), context())).kind).toBe('new')
  })

  it('refuses a week 9 weeks back', async () => {
    const outcome = expectKind(await classifyScan(await countsQr({ week: '2026-W32' }), context()), 'invalid')
    expect(outcome.code).toBe('week-out-of-range')
  })

  it('takes next week only once it is at most 2 days away (Manila time)', async () => {
    const nextWeek = await countsQr({ week: '2026-W42' })
    // Friday 23:59 in Manila: Monday is more than 2 days away.
    const friday = new Date('2026-10-09T15:59:00.000Z')
    expect((await classifyScan(nextWeek, context({ now: friday }))).kind).toBe('invalid')
    // Saturday 00:00 in Manila: Monday is 2 days away.
    const saturday = new Date('2026-10-09T16:00:00.000Z')
    expect((await classifyScan(nextWeek, context({ now: saturday }))).kind).toBe('new')
    // Two weeks ahead never.
    expect((await classifyScan(await countsQr({ week: '2026-W43' }), context({ now: saturday }))).kind).toBe('invalid')
  })
})

describe('pairing QRs', () => {
  it('asks the officer to compare the fingerprint before pairing', async () => {
    const text = encodePairing({ barangay: 'SID-MAL', municipality: 'SID', publicJwk: phone.publicJwk })
    const outcome = expectKind(await classifyScan(text, context({ devices: [] })), 'pair')
    expect(outcome.fingerprint).toBe(paired.fingerprint)
    expect(outcome.current).toBeNull()
    expect(describeOutcome(outcome)).toContain('Check that the phone shows the same fingerprint')
  })

  it('says "already paired" for the same key, and shows the key it would replace for a new one', async () => {
    const same = encodePairing({ barangay: 'SID-MAL', municipality: 'SID', publicJwk: phone.publicJwk })
    expectKind(await classifyScan(same, context()), 'already-paired')
    const replacement = encodePairing({ barangay: 'SID-MAL', municipality: 'SID', publicJwk: otherPhone.publicJwk })
    const outcome = expectKind(await classifyScan(replacement, context()), 'pair')
    expect(outcome.current).toBe(paired)
    expect(outcome.fingerprint).not.toBe(paired.fingerprint)
  })

  it('refuses a phone from another municipality', async () => {
    const text = encodePairing({ barangay: 'XYZ-MAL', municipality: 'XYZ', publicJwk: phone.publicJwk })
    const outcome = expectKind(await classifyScan(text, context()), 'other-municipality')
    expect(describeOutcome(outcome)).toBe(
      'This QR is for municipality XYZ (XYZ-MAL). This laptop receives only its own barangays.',
    )
  })

  it('reports a damaged pairing QR', async () => {
    const outcome = expectKind(await classifyScan('AGPK1.bm90IGpzb24', context()), 'invalid')
    expect(outcome).toMatchObject({ source: 'pairing', code: 'invalid-pairing' })
    expect(describeOutcome(outcome)).toBe('This pairing QR is damaged or was changed. Ask the health worker to show it again.')
  })
})

describe('compareExports', () => {
  it('orders by week, then seq', () => {
    expect(compareExports({ epiWeek: '2026-W41', seq: 1 }, { epiWeek: '2026-W40', seq: 9 })).toBeGreaterThan(0)
    expect(compareExports({ epiWeek: '2026-W41', seq: 2 }, { epiWeek: '2026-W41', seq: 3 })).toBeLessThan(0)
    expect(compareExports({ epiWeek: '2026-W41', seq: 3 }, { epiWeek: '2026-W41', seq: 3 })).toBe(0)
  })
})

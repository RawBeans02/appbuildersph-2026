import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { openAgapayDb } from '../../../data/db/db'
import { createPayload, encodePairing, encodeQr, generateDeviceKeyPair, keyFingerprint, type DeviceKeyPair } from '../../../qr'
import { pairDevice, readHandoff, receiveScan } from '../municipal'
import { NO_COUNTS } from '../testSample'
import { scanBanner } from './banner'
import type { ScanOutcome } from './classify'

// The scan results (17g, 17h on 17b–17f), end to end: a signed QR goes
// through receiveScan (classify, then store) and comes out as its result
// panel: the checks in the order the laptop ran them, stopping at the one
// that failed.

const NOW = new Date('2026-10-09T09:05:00.000Z')
const clock = () => '9:05 AM'
let phone: DeviceKeyPair
let stranger: DeviceKeyPair
let phoneFingerprint: string
let dbCount = 0

beforeAll(async () => {
  ;[phone, stranger] = await Promise.all([generateDeviceKeyPair(), generateDeviceKeyPair()])
  phoneFingerprint = await keyFingerprint(phone.publicJwk)
})

const countsQr = (seq: number, key = phone.privateKey, epiWeek = '2026-W41') =>
  encodeQr(
    createPayload({ municipality: 'SID', barangay: 'SID-STN', epiWeek, seq, counts: { ...NO_COUNTS, inWatchWindow: 5 } }),
    key,
  )

async function pairedLaptop() {
  const db = await openAgapayDb(`banner-test-${++dbCount}`)
  const pairing = await receiveScan(db, encodePairing({ barangay: 'SID-STN', municipality: 'SID', publicJwk: phone.publicJwk }), NOW)
  if (pairing.kind !== 'pair') throw new Error(pairing.kind)
  expect(scanBanner(pairing)).toBeNull() // the officer confirms a pairing; it isn't a result panel
  await pairDevice(db, pairing, NOW)
  return db
}

const READ = { status: 'ok', text: 'Read the QR: counts only, no names' }

describe('scan results', () => {
  it('17g received: a paired phone’s first export this week, every check passed', async () => {
    const db = await pairedLaptop()
    const banner = scanBanner(await receiveScan(db, await countsQr(4), NOW), { formatTime: clock, inCount: { received: 5, expected: 5 } })
    expect(banner).toEqual({
      kind: 'received',
      tone: 'ok',
      title: 'Santo Niño-D received',
      lines: [
        READ,
        { status: 'ok', text: 'Signed by the paired Santo Niño-D phone', detail: `Key ${phoneFingerprint}` },
        { status: 'ok', text: 'Week 2026-W41 · export #4, the newest from this phone' },
        { status: 'ok', text: 'Added to the merged view · 5 of 5 in' },
      ],
      barangay: 'SID-STN',
      live: 'Santo Niño-D received. 5 of 5 barangays in.',
    })
    expect((await readHandoff(db)).received.map((item) => item.seq)).toEqual([4])
    db.close()
  })

  it('17h already received: the same export again is an info line and changes nothing', async () => {
    const db = await pairedLaptop()
    await receiveScan(db, await countsQr(3), NOW)
    const banner = scanBanner(await receiveScan(db, await countsQr(3), NOW), { formatTime: clock })
    expect(banner).toMatchObject({ kind: 'already-received', tone: 'info', title: 'Already received' })
    expect(banner?.lines).toEqual([
      READ,
      { status: 'ok', text: 'Signed by the paired Santo Niño-D phone', detail: `Key ${phoneFingerprint}` },
      { status: 'info', text: 'Already have export #3 from 9:05 AM. Nothing changed.' },
    ])
    expect(banner?.body).toBeUndefined()
    expect(banner?.live).toBe('Already received. Already have export #3 from 9:05 AM. Nothing changed.')
    expect((await readHandoff(db)).received).toHaveLength(1)
    db.close()
  })

  it('17h wrong signature: read passes, the signature line fails, nothing is saved', async () => {
    const db = await pairedLaptop()
    const banner = scanBanner(await receiveScan(db, await countsQr(5, stranger.privateKey), NOW), { formatTime: clock })
    expect(banner).toEqual({
      kind: 'not-valid',
      tone: 'bad',
      title: 'Not a valid AgapayMo QR',
      lines: [READ, { status: 'failed', text: 'Not signed by the phone paired for Santo Niño-D. Nothing was saved.' }],
      body: 'If Santo Niño-D has a new phone, pair it first.',
      live: 'Not a valid AgapayMo QR. Not signed by the phone paired for Santo Niño-D. Nothing was saved. If Santo Niño-D has a new phone, pair it first.',
    })
    expect((await readHandoff(db)).received).toEqual([])
    db.close()
  })

  it('17h not an AgapayMo QR: the first line fails, then the existing body', async () => {
    const db = await pairedLaptop()
    const banner = scanBanner(await receiveScan(db, 'https://example.com', NOW), { formatTime: clock })
    expect(banner).toMatchObject({
      kind: 'not-valid',
      tone: 'bad',
      title: 'Not a valid AgapayMo QR',
      lines: [{ status: 'failed', text: "Couldn't read this as AgapayMo counts" }],
      body: "It isn't from a paired AgapayMo phone, so nothing was saved. Ask the health worker to open Send on AgapayMo.",
    })
    expect((await readHandoff(db)).received).toEqual([])
    db.close()
  })

  it('17g newer replaces older: export #4 after #3 keeps only #4', async () => {
    const db = await pairedLaptop()
    await receiveScan(db, await countsQr(3), NOW)
    const banner = scanBanner(await receiveScan(db, await countsQr(4), NOW), { formatTime: clock, inCount: { received: 4, expected: 5 } })
    expect(banner).toMatchObject({ kind: 'updated', tone: 'ok', title: 'Santo Niño-D updated', barangay: 'SID-STN' })
    expect(banner?.lines.map((line) => line.text)).toEqual([
      'Read the QR: counts only, no names',
      'Signed by the paired Santo Niño-D phone',
      'Export #4 is newer, so it replaces #3.',
      'Added to the merged view · 4 of 5 in',
    ])
    expect(banner?.lines.every((line) => line.status === 'ok')).toBe(true)
    expect((await readHandoff(db)).received.map((item) => item.seq)).toEqual([4])
    db.close()
  })

  it('17h a week far in the future (the phone date is wrong): refused, nothing saved, this week still lands', async () => {
    const db = await pairedLaptop()
    const banner = scanBanner(await receiveScan(db, await countsQr(1, phone.privateKey, '2099-W01'), NOW), { formatTime: clock })
    expect(banner).toMatchObject({ kind: 'not-valid', tone: 'bad' })
    expect(banner?.lines).toEqual([
      READ,
      { status: 'ok', text: 'Signed by the paired Santo Niño-D phone', detail: `Key ${phoneFingerprint}` },
      { status: 'failed', text: "This report's week (2099-W01) is not this week or the last 8 weeks." },
    ])
    expect(banner?.body).toBe('Check the date on the phone, then make the QR again. Nothing was saved.')
    expect((await readHandoff(db)).received).toEqual([])
    expect((await receiveScan(db, await countsQr(2), NOW)).kind).toBe('new')
    db.close()
  })

  it('17h an older export after a newer one: kept the newer export, nothing changed', async () => {
    const db = await pairedLaptop()
    await receiveScan(db, await countsQr(4), NOW)
    const banner = scanBanner(await receiveScan(db, await countsQr(3), NOW), { formatTime: clock })
    expect(banner).toMatchObject({ kind: 'older', tone: 'info', title: 'Already received' })
    expect(banner?.lines).toEqual([
      READ,
      { status: 'ok', text: 'Signed by the paired Santo Niño-D phone', detail: `Key ${phoneFingerprint}` },
      { status: 'info', text: 'Kept the newer export #4.' },
    ])
    expect((await readHandoff(db)).received.map((item) => item.seq)).toEqual([4])
    db.close()
  })
})

describe('scan results for the other outcomes', () => {
  const invalid = (code: string, source: 'counts' | 'pairing' = 'counts'): ScanOutcome =>
    ({ kind: 'invalid', source, code, detail: '', barangay: 'SID-MAL' }) as ScanOutcome

  it('17h no phone paired: read passes, the pairing line fails, then what to do', () => {
    const banner = scanBanner(invalid('unknown-device'))
    expect(banner).toMatchObject({ kind: 'not-valid', tone: 'bad' })
    expect(banner?.lines).toEqual([READ, { status: 'failed', text: 'No phone is paired for Maligaya-D yet. Nothing was saved.' }])
    expect(banner?.body).toBe("Scan the pairing QR on that phone's Send screen first, then its counts QR.")
  })

  it('17h damaged, another version, or a bad pairing QR: the first line fails', () => {
    for (const outcome of [
      invalid('invalid-payload'),
      invalid('bad-version'),
      invalid('not-agapay'),
      invalid('invalid-pairing', 'pairing'),
      invalid('bad-version', 'pairing'),
      invalid('not-pairing', 'pairing'),
    ]) {
      const banner = scanBanner(outcome)
      expect(banner?.tone).toBe('bad')
      expect(banner?.lines).toEqual([{ status: 'failed', text: "Couldn't read this as AgapayMo counts" }])
    }
  })

  it('17h another municipality: read passes, then it stops', () => {
    const banner = scanBanner({ kind: 'other-municipality', municipality: 'XYZ', barangay: 'XYZ-A' })
    expect(banner).toMatchObject({ kind: 'not-valid', tone: 'bad' })
    expect(banner?.lines).toEqual([READ, { status: 'failed', text: 'From another municipality. Nothing was saved.' }])
  })

  it('a phone already paired: no checks, just what to do next', () => {
    const banner = scanBanner({
      kind: 'already-paired',
      pairing: { barangay: 'SID-MAL', municipality: 'SID', publicJwk: phone.publicJwk },
      fingerprint: 'F',
      current: { barangay: 'SID-MAL', publicJwk: phone.publicJwk, fingerprint: 'F', pairedAt: NOW.toISOString(), source: 'pairing' },
    } as ScanOutcome)
    expect(banner).toEqual({
      kind: 'already-paired',
      tone: 'info',
      title: 'Maligaya-D is already paired',
      lines: [],
      body: 'Now scan the counts QR on its Send screen.',
      live: 'Maligaya-D is already paired. Now scan the counts QR on its Send screen.',
    })
  })
})

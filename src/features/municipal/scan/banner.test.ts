import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { openAgapayDb } from '../../../data/db/db'
import { createPayload, encodePairing, encodeQr, generateDeviceKeyPair, type DeviceKeyPair } from '../../../qr'
import { pairDevice, readHandoff, receiveScan } from '../municipal'
import { NO_COUNTS } from '../testSample'
import { scanBanner } from './banner'

// The four designed scan results (17b–17e), end to end: a signed QR goes
// through receiveScan (classify, then store) and comes out as its banner.

const NOW = new Date('2026-10-09T09:05:00.000Z')
const clock = () => '9:05 AM'
let phone: DeviceKeyPair
let stranger: DeviceKeyPair
let dbCount = 0

beforeAll(async () => {
  ;[phone, stranger] = await Promise.all([generateDeviceKeyPair(), generateDeviceKeyPair()])
})

const countsQr = (seq: number, key = phone.privateKey) =>
  encodeQr(
    createPayload({ municipality: 'SID', barangay: 'SID-STN', epiWeek: '2026-W41', seq, counts: { ...NO_COUNTS, inWatchWindow: 5 } }),
    key,
  )

async function pairedLaptop() {
  const db = await openAgapayDb(`banner-test-${++dbCount}`)
  const pairing = await receiveScan(db, encodePairing({ barangay: 'SID-STN', municipality: 'SID', publicJwk: phone.publicJwk }), NOW)
  if (pairing.kind !== 'pair') throw new Error(pairing.kind)
  expect(scanBanner(pairing)).toBeNull() // the officer confirms a pairing; it isn't a banner
  await pairDevice(db, pairing, NOW)
  return db
}

describe('scan banners', () => {
  it('17b success: a paired phone’s first export this week', async () => {
    const db = await pairedLaptop()
    const banner = scanBanner(await receiveScan(db, await countsQr(4), NOW), clock)
    expect(banner).toEqual({
      kind: 'received',
      tone: 'ok',
      title: 'Santo Niño-D received',
      body: 'Week 2026-W41 · export #4 · signed by the paired Santo Niño-D phone.',
      barangay: 'SID-STN',
    })
    expect((await readHandoff(db)).received.map((item) => item.seq)).toEqual([4])
    db.close()
  })

  it('17c already received: the same export again changes nothing', async () => {
    const db = await pairedLaptop()
    await receiveScan(db, await countsQr(3), NOW)
    const banner = scanBanner(await receiveScan(db, await countsQr(3), NOW), clock)
    expect(banner).toEqual({
      kind: 'already-received',
      tone: 'info',
      title: 'Already received',
      body: 'Santo Niño-D export #3 came in at 9:05 AM. Nothing changed.',
    })
    expect((await readHandoff(db)).received).toHaveLength(1)
    db.close()
  })

  it('17d not valid: a QR from an unpaired phone or a stranger’s key saves nothing', async () => {
    const db = await pairedLaptop()
    const forged = scanBanner(await receiveScan(db, await countsQr(5, stranger.privateKey), NOW), clock)
    const junk = scanBanner(await receiveScan(db, 'https://example.com', NOW), clock)
    for (const banner of [forged, junk]) {
      expect(banner).toEqual({
        kind: 'not-valid',
        tone: 'bad',
        title: 'Not a valid AgapayMo QR',
        body: "It isn't from a paired AgapayMo phone, so nothing was saved. Ask the health worker to open Send on AgapayMo.",
      })
    }
    expect((await readHandoff(db)).received).toEqual([])
    db.close()
  })

  it('17e newer replaces older: export #4 after #3 keeps only #4', async () => {
    const db = await pairedLaptop()
    await receiveScan(db, await countsQr(3), NOW)
    const banner = scanBanner(await receiveScan(db, await countsQr(4), NOW), clock)
    expect(banner).toEqual({
      kind: 'updated',
      tone: 'ok',
      title: 'Santo Niño-D updated',
      body: 'Export #4 is newer, so it replaces #3.',
      barangay: 'SID-STN',
    })
    expect((await readHandoff(db)).received.map((item) => item.seq)).toEqual([4])
    db.close()
  })

  it('an older export after a newer one changes nothing either', async () => {
    const db = await pairedLaptop()
    await receiveScan(db, await countsQr(4), NOW)
    const banner = scanBanner(await receiveScan(db, await countsQr(3), NOW), clock)
    expect(banner).toMatchObject({ kind: 'older', tone: 'info', body: 'Santo Niño-D export #3 is older than #4, so nothing changed.' })
    expect((await readHandoff(db)).received.map((item) => item.seq)).toEqual([4])
    db.close()
  })
})

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openAgapayDb } from '../../data/db/db'
import type { Exposure, HingaCheck, Resident, StockLot } from '../../data/db/types'
import { decodePairing, decodeQr } from '../../qr'
import { ageBand, ageInMonths, collectRawCounts, hingaBand } from './counts'
import { createExport, createPairingQr } from './exportQr'
import { ensureDeviceIdentity, resolvePlace } from './identity'

const TODAY = '2026-10-10'

// Seed records come without the sample flag; the loader adds it.
function withoutSample<T extends { sample: boolean }>(record: T): Omit<T, 'sample'> {
  const copy: Partial<T> = { ...record }
  delete copy.sample
  return copy as Omit<T, 'sample'>
}

const resident = (id: string, birthDate: string): Resident => ({
  id,
  name: `Residente ${id}`,
  householdId: 'HH-01',
  purok: 'Purok 1',
  sex: 'F',
  birthDate,
  sample: true,
})
const exposure = (residentId: string, exposedOn: string): Exposure => ({
  id: `e-${residentId}-${exposedOn}`,
  floodEventId: 'f1',
  residentId,
  exposedOn,
  kinds: ['waded'],
  createdAt: '',
  sample: true,
})
const check = (id: string, ageMonths: number, outcome: HingaCheck['outcome'], checkedAt: string): HingaCheck => ({
  id,
  residentId: null,
  checkedAt,
  ageMonths,
  breathsPerMinute: outcome === 'refused' ? null : 50,
  outcome,
  refusal: null,
  dangerSigns: [],
  sample: true,
})
const doxy = (quantity: number, expiry: string): StockLot => ({
  id: `lot-${expiry}-${quantity}`,
  drug: 'Doxycycline',
  strength: '100 mg',
  lot: 'DEMO-LOT-1',
  expiry,
  quantity,
  unit: 'capsule',
  source: 'manual',
  ocrConfidence: null,
  confirmedAt: '',
  sample: true,
})

describe('ages', () => {
  it('counts whole months and maps them to the payload bands', () => {
    expect(ageInMonths('2026-08-15', TODAY)).toBe(1)
    expect(ageInMonths('2026-08-10', TODAY)).toBe(2)
    expect([1, 2, 11, 12, 59, 60, 215, 216, 719, 720].map(ageBand)).toEqual([
      'under2m', 'm2to12', 'm2to12', 'y1to5', 'y1to5', 'y5to17', 'y5to17', 'y18to59', 'y18to59', 'y60plus',
    ])
    expect(hingaBand(30)).toBe('y1to5')
    expect(hingaBand(60)).toBeNull()
  })
})

describe('collectRawCounts', () => {
  it('counts exposure by age band, the open watch window, this week\'s referrals, stock and open flags', () => {
    const counts = collectRawCounts(
      {
        residents: [resident('child', '2024-01-01'), resident('adult', '1990-01-01'), resident('old', '1950-01-01')],
        exposures: [exposure('child', '2026-10-03'), exposure('adult', '2026-10-08'), exposure('old', '2026-08-01')],
        hingaChecks: [
          check('h1', 20, 'fast', '2026-10-09T02:00:00.000Z'),
          check('h2', 6, 'urgent', '2026-10-08T02:00:00.000Z'),
          check('h3', 20, 'fast', '2026-09-20T02:00:00.000Z'),
          check('h4', 20, 'not-fast', '2026-10-09T03:00:00.000Z'),
        ],
        stockLots: [doxy(10, '2027-06'), doxy(30, '2026-11'), doxy(5, '2026-08')],
        flags: [
          { id: 'f1', kind: 'clinician-review', createdAt: '', reason: '', details: {}, status: 'open', sample: false },
          { id: 'f2', kind: 'clinician-review', createdAt: '', reason: '', details: {}, status: 'resolved', sample: false },
        ],
      },
      TODAY,
    )
    expect(counts).toEqual({
      exposed: { under2m: 0, m2to12: 0, y1to5: 1, y5to17: 0, y18to59: 1, y60plus: 0 },
      inWatchWindow: 1,
      fastBreathing: { under2m: 0, m2to12: 0, y1to5: 1 },
      urgentReferrals: 1,
      doxyCapsulesOnHand: 40,
      doxyCapsulesExpiring6w: 30,
      clinicianReviewFlags: 1,
    })
  })
})

describe('resolvePlace', () => {
  const info = (municipality: string, barangay: string) => ({ version: '1', municipality, barangay, loadedAt: '' })
  it('maps the seed names to codes, and never guesses an unknown one', () => {
    expect(resolvePlace(info('San Isidro Demo', 'Maligaya-D'))).toEqual({ ok: true, municipality: 'SID', barangay: 'SID-MAL' })
    expect(resolvePlace(info('San Isidro Demo', 'Elsewhere'))).toMatchObject({ ok: false })
    expect(resolvePlace(info('Other', 'Maligaya-D'))).toMatchObject({ ok: false })
    expect(resolvePlace(null)).toMatchObject({ ok: false })
  })
})

describe('createExport', () => {
  it('signs a QR that the laptop verifies with this phone\'s key, suppressing small counts and numbering exports', async () => {
    const db = await openAgapayDb('send-test-1')
    await db.loadSeed({
      version: 't',
      municipality: 'San Isidro Demo',
      barangay: 'Maligaya-D',
      residents: Array.from({ length: 7 }, (_, i) => withoutSample(resident(`r${i}`, '1990-01-01'))),
      exposures: Array.from({ length: 7 }, (_, i) => withoutSample(exposure(`r${i}`, '2026-10-03'))),
      stockLots: [withoutSample(doxy(3, '2027-06'))],
    })

    const first = await createExport(db, TODAY)
    const second = await createExport(db, TODAY)
    if (!first.ok || !second.ok) throw new Error('export failed')
    expect([first.payload.seq, second.payload.seq]).toEqual([1, 2])
    expect(first.payload).toMatchObject({ municipality: 'SID', barangay: 'SID-MAL', epiWeek: '2026-W41' })
    expect(first.payload.counts.exposed.y18to59).toBe(7)
    expect(first.payload.counts.doxyCapsulesOnHand).toBe('<5')

    const identity = await db.getDeviceIdentity()
    const decoded = await decodeQr(second.text, { 'SID-MAL': identity!.publicJwk })
    expect(decoded).toMatchObject({ ok: true })
    expect(first.text).not.toMatch(/Residente|HH-01|Purok|1990/)
    db.close()
  })

  it('refuses to export for an unknown barangay, and keeps one identity per phone', async () => {
    const db = await openAgapayDb('send-test-2')
    expect(await createExport(db, TODAY)).toMatchObject({ ok: false })
    const identity = await ensureDeviceIdentity(db, 'SID-MAL')
    expect((await ensureDeviceIdentity(db, 'SID-MAL')).fingerprint).toBe(identity.fingerprint)
    await expect(ensureDeviceIdentity(db, 'SID-BGS')).rejects.toThrow('set up for SID-MAL')
    db.close()
  })
})

describe('createPairingQr', () => {
  it('shows the same key the counts QR is signed with, and the fingerprint the laptop will show', async () => {
    const db = await openAgapayDb('send-test-3')
    await db.loadSeed({ version: 't', municipality: 'San Isidro Demo', barangay: 'Maligaya-D', residents: [] })
    const pairing = await createPairingQr(db)
    if (!pairing.ok) throw new Error(pairing.reason)
    const decoded = await decodePairing(pairing.text)
    expect(decoded).toMatchObject({ ok: true, fingerprint: pairing.fingerprint, pairing: { barangay: 'SID-MAL', municipality: 'SID' } })

    const exported = await createExport(db, TODAY)
    if (!exported.ok || !decoded.ok) throw new Error('failed')
    expect(exported.fingerprint).toBe(pairing.fingerprint)
    expect(await decodeQr(exported.text, { 'SID-MAL': decoded.pairing.publicJwk })).toMatchObject({ ok: true })
    db.close()
  })
})

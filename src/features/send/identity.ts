import type { AgapayDb } from '../../data/db/db'
import type { DeviceIdentity, SeedInfo } from '../../data/db/types'
import { barangayCode, DEMO_MUNICIPALITY } from '../../data/places'
import { generateDeviceKeyPair, keyFingerprint } from '../../qr'

// Which barangay this phone reports for, and its signing identity.

export type Place = { ok: true; municipality: string; barangay: string } | { ok: false; reason: string }

// From the seed's place names. Never guesses: an unknown name is an error.
export function resolvePlace(seed: SeedInfo | null): Place {
  if (!seed) return { ok: false, reason: 'This phone has no barangay set up yet.' }
  if (seed.municipality !== DEMO_MUNICIPALITY.name) {
    return { ok: false, reason: `Unknown municipality "${seed.municipality}".` }
  }
  const barangay = barangayCode(seed.barangay)
  if (!barangay) return { ok: false, reason: `Unknown barangay "${seed.barangay}".` }
  return { ok: true, municipality: DEMO_MUNICIPALITY.code, barangay }
}

// Calls run one at a time per database, so two quick first taps can't each
// make a key (the second would replace the first, and a QR signed with the
// first would no longer verify).
const queues = new WeakMap<AgapayDb, Promise<unknown>>()

// Made once, on the first send or pairing, from the user's action. The private
// key is non-extractable: it can sign, but can't be read out of IndexedDB.
export function ensureDeviceIdentity(db: AgapayDb, barangay: string, now = new Date()): Promise<DeviceIdentity> {
  const previous = queues.get(db) ?? Promise.resolve()
  const run = previous.catch(() => {}).then(() => getOrCreateIdentity(db, barangay, now))
  queues.set(db, run)
  return run
}

async function getOrCreateIdentity(db: AgapayDb, barangay: string, now: Date): Promise<DeviceIdentity> {
  const existing = await db.getDeviceIdentity()
  if (existing) {
    if (existing.barangay !== barangay) {
      throw new Error(`This phone is set up for ${existing.barangay}, not ${barangay}.`)
    }
    return existing
  }
  const keys = await generateDeviceKeyPair()
  const identity: DeviceIdentity = {
    id: 'self',
    barangay,
    privateKey: keys.privateKey,
    publicJwk: keys.publicJwk,
    fingerprint: await keyFingerprint(keys.publicJwk),
    nextSeq: 1,
    createdAt: now.toISOString(),
  }
  await db.putDeviceIdentity(identity)
  return identity
}

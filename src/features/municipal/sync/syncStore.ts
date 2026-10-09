import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { generateDeviceKeyPair, keyFingerprint, type PublicJwk } from '../../../qr'
import type { SyncRow } from './results'

// The laptop's sync state, in its own small IndexedDB database ("agapay-sync"),
// apart from the app's records (src/data/db/), which it never changes:
// - the laptop's own key, made like the phone's (generateDeviceKeyPair: a
//   non-extractable ECDSA P-256 CryptoKey kept as is, so it can sign but
//   can't be read out);
// - whether the server accepted it (enrollment);
// - the last sync's time and per-barangay results.
// Reset sample data doesn't touch it, like the phone's own key.

export type LaptopIdentity = {
  id: 'identity'
  privateKey: CryptoKey
  publicJwk: PublicJwk
  fingerprint: string
  createdAt: string
}

export type Enrollment = { id: 'enrollment'; fingerprint: string; municipality: string; enrolledAt: string }

export type LastSync = { id: 'lastSync'; at: string; rows: SyncRow[] }

type Row = LaptopIdentity | Enrollment | LastSync

interface SyncSchema extends DBSchema {
  state: { key: Row['id']; value: Row }
}

export const SYNC_DB_NAME = 'agapay-sync'

export type SyncStore = {
  getIdentity(): Promise<LaptopIdentity | null>
  ensureIdentity(now?: Date): Promise<LaptopIdentity>
  getEnrollment(): Promise<Enrollment | null>
  putEnrollment(enrollment: Omit<Enrollment, 'id'>): Promise<void>
  clearEnrollment(): Promise<void>
  getLastSync(): Promise<LastSync | null>
  putLastSync(sync: Omit<LastSync, 'id'>): Promise<void>
  close(): void
}

export async function openSyncStore(name = SYNC_DB_NAME): Promise<SyncStore> {
  const db: IDBPDatabase<SyncSchema> = await openDB<SyncSchema>(name, 1, {
    upgrade(database) {
      database.createObjectStore('state', { keyPath: 'id' })
    },
  })
  const get = async <T extends Row>(id: T['id']) => ((await db.get('state', id)) as T | undefined) ?? null
  // One at a time, so two quick first taps can't make two keys.
  let making: Promise<LaptopIdentity> | null = null

  return {
    getIdentity: () => get<LaptopIdentity>('identity'),
    ensureIdentity(now = new Date()) {
      making ??= (async () => {
        const existing = await get<LaptopIdentity>('identity')
        if (existing) return existing
        const keys = await generateDeviceKeyPair()
        const identity: LaptopIdentity = {
          id: 'identity',
          privateKey: keys.privateKey,
          publicJwk: keys.publicJwk,
          fingerprint: await keyFingerprint(keys.publicJwk),
          createdAt: now.toISOString(),
        }
        await db.put('state', identity)
        return identity
      })().finally(() => {
        making = null
      })
      return making
    },
    getEnrollment: () => get<Enrollment>('enrollment'),
    async putEnrollment(enrollment) {
      await db.put('state', { id: 'enrollment', ...enrollment })
    },
    async clearEnrollment() {
      await db.delete('state', 'enrollment')
    },
    getLastSync: () => get<LastSync>('lastSync'),
    async putLastSync(sync) {
      await db.put('state', { id: 'lastSync', ...sync })
    },
    close: () => db.close(),
  }
}

let shared: Promise<SyncStore> | null = null

// The page's one sync store.
export function getSyncStore(): Promise<SyncStore> {
  shared ??= openSyncStore().catch((error: unknown) => {
    shared = null
    throw error
  })
  return shared
}

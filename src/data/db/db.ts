import { openDB, type DBSchema, type IDBPDatabase, type IndexNames, type StoreNames, type StoreValue } from 'idb'
import type {
  Approval,
  DeviceIdentity,
  Exposure,
  Flag,
  FloodEvent,
  HingaCheck,
  PairedDevice,
  Plan,
  ReceivedPayload,
  Resident,
  SeedData,
  SeedInfo,
  StockLot,
  WatchCheck,
} from './types'
import { LockedError, openValue, sealValue, session, type LockAttempts, type LockRecord, type SealedBox } from './vault'

// The on-device database. Every list is bounded (QUALITY.md): pass a limit, or
// get DEFAULT_LIMIT. Writes notify subscribers of that store, so screens can
// re-read what changed.

interface AgapaySchema extends DBSchema {
  residents: { key: string; value: Resident; indexes: { byHousehold: string } }
  floodEvents: { key: string; value: FloodEvent; indexes: { byStartedOn: string } }
  exposures: {
    key: string
    value: Exposure
    indexes: { byFloodEvent: string; byResident: string; byExposedOn: string }
  }
  hingaChecks: { key: string; value: HingaCheck; indexes: { byResident: string; byCheckedAt: string } }
  stockLots: { key: string; value: StockLot; indexes: { byExpiry: string; byDrug: string } }
  flags: { key: string; value: Flag; indexes: { byStatus: string; byCreatedAt: string } }
  approvals: { key: string; value: Approval; indexes: { byApprovedAt: string } }
  meta: { key: string; value: unknown }
  // Version 2
  deviceIdentity: { key: string; value: DeviceIdentity }
  receivedPayloads: { key: string; value: ReceivedPayload; indexes: { byEpiWeek: string; byBarangay: string } }
  pairedDevices: { key: string; value: PairedDevice }
  plans: { key: string; value: Plan; indexes: { byEpiWeek: string } }
  // Version 3
  watchChecks: { key: string; value: WatchCheck; indexes: { byResident: string; byCheckedAt: string } }
}

export type RecordStore = Exclude<StoreNames<AgapaySchema>, 'meta'>

export const DB_NAME = 'agapay'
export const DB_VERSION = 3
export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 1000

function boundedLimit(limit = DEFAULT_LIMIT): number {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be a positive integer, got ${limit}`)
  return Math.min(limit, MAX_LIMIT)
}

export type ListOptions = {
  limit?: number
  // Continue after this id (ids are the primary key order).
  after?: string
}

// Phase 2 (vault.ts): the fields sealed at rest, per store, when the
// database is opened with encryption on. They're the ones that identify a
// person or describe their health. Ids, the fields indexes use (dates,
// resident and flood ids) and stock, which isn't personal, stay plain, so
// every index keeps working. A sealed record keeps its plain fields and
// carries the rest in `sealed`, one AES-GCM box with its own random IV.
export const SEALED_FIELDS: Partial<Record<RecordStore, readonly string[]>> = {
  residents: ['name', 'birthDate', 'householdId', 'purok', 'sex'],
  floodEvents: ['note', 'puroks'],
  exposures: ['kinds'],
  hingaChecks: ['ageMonths', 'breathsPerMinute', 'outcome', 'refusal', 'dangerSigns', 'method'],
  watchChecks: ['result'],
}

type Stored = Record<string, unknown> & { sealed?: SealedBox }

function createCodec(encryption: boolean) {
  const keyOrThrow = () => {
    const key = session.key()
    if (!key) throw new LockedError()
    return key
  }
  return {
    async seal<T>(store: RecordStore, record: T): Promise<T> {
      const fields = SEALED_FIELDS[store]
      if (!encryption || !fields) return record
      const rest: Stored = { ...(record as Stored) }
      const secret: Record<string, unknown> = {}
      for (const field of fields) {
        if (field in rest) {
          secret[field] = rest[field]
          delete rest[field]
        }
      }
      rest.sealed = await sealValue(keyOrThrow(), secret)
      return rest as T
    },
    // Plain records (written with encryption off) are read as they are.
    async open<T>(record: T): Promise<T> {
      const stored = record as Stored | undefined
      if (!stored?.sealed) return record
      const { sealed, ...rest } = stored
      return { ...rest, ...(await openValue<Record<string, unknown>>(keyOrThrow(), sealed)) } as T
    },
  }
}

type Codec = ReturnType<typeof createCodec>

function createRepository<S extends RecordStore>(
  db: IDBPDatabase<AgapaySchema>,
  store: S,
  notify: (store: RecordStore) => void,
  codec: Codec,
) {
  type Value = StoreValue<AgapaySchema, S>
  const openAll = (records: Value[]) => Promise.all(records.map((record) => codec.open(record)))
  return {
    get: async (id: string): Promise<Value | undefined> => codec.open(await db.get(store, id)),
    async put(record: Value): Promise<void> {
      await db.put(store, await codec.seal(store, record))
      notify(store)
    },
    async putMany(records: Value[]): Promise<void> {
      // Sealed before the transaction: it would commit while awaiting crypto.
      const sealed = await Promise.all(records.map((record) => codec.seal(store, record)))
      const tx = db.transaction(store, 'readwrite')
      await Promise.all([...sealed.map((record) => tx.store.put(record)), tx.done])
      notify(store)
    },
    async delete(id: string): Promise<void> {
      await db.delete(store, id)
      notify(store)
    },
    count: (): Promise<number> => db.count(store),
    async list(options: ListOptions = {}): Promise<Value[]> {
      const range = options.after === undefined ? undefined : IDBKeyRange.lowerBound(options.after, true)
      return openAll(await db.getAll(store, range, boundedLimit(options.limit)))
    },
    async listBy(
      index: IndexNames<AgapaySchema, S>,
      value: string,
      options: { limit?: number } = {},
    ): Promise<Value[]> {
      return openAll(await db.getAllFromIndex(store, index, IDBKeyRange.only(value), boundedLimit(options.limit)))
    },
  }
}

export type Repository<S extends RecordStore> = ReturnType<typeof createRepository<S>>

// encryption: seal SEALED_FIELDS with the session key (phase 2). Off, every
// record is written plain, as before phase 2.
export async function openAgapayDb(name = DB_NAME, { encryption = false }: { encryption?: boolean } = {}) {
  const db = await openDB<AgapaySchema>(name, DB_VERSION, {
    upgrade(database, oldVersion) {
      // One block per version, so later versions add stores without losing data.
      if (oldVersion < 1) {
        database.createObjectStore('residents', { keyPath: 'id' }).createIndex('byHousehold', 'householdId')
        database.createObjectStore('floodEvents', { keyPath: 'id' }).createIndex('byStartedOn', 'startedOn')
        const exposures = database.createObjectStore('exposures', { keyPath: 'id' })
        exposures.createIndex('byFloodEvent', 'floodEventId')
        exposures.createIndex('byResident', 'residentId')
        exposures.createIndex('byExposedOn', 'exposedOn')
        const hinga = database.createObjectStore('hingaChecks', { keyPath: 'id' })
        hinga.createIndex('byResident', 'residentId')
        hinga.createIndex('byCheckedAt', 'checkedAt')
        const stock = database.createObjectStore('stockLots', { keyPath: 'id' })
        stock.createIndex('byExpiry', 'expiry')
        stock.createIndex('byDrug', 'drug')
        const flags = database.createObjectStore('flags', { keyPath: 'id' })
        flags.createIndex('byStatus', 'status')
        flags.createIndex('byCreatedAt', 'createdAt')
        database.createObjectStore('approvals', { keyPath: 'id' }).createIndex('byApprovedAt', 'approvedAt')
        database.createObjectStore('meta')
      }
      if (oldVersion < 2) {
        database.createObjectStore('deviceIdentity', { keyPath: 'id' })
        const received = database.createObjectStore('receivedPayloads', { keyPath: 'id' })
        received.createIndex('byEpiWeek', 'epiWeek')
        received.createIndex('byBarangay', 'barangay')
        database.createObjectStore('pairedDevices', { keyPath: 'barangay' })
        database.createObjectStore('plans', { keyPath: 'id' }).createIndex('byEpiWeek', 'epiWeek')
      }
      if (oldVersion < 3) {
        const checks = database.createObjectStore('watchChecks', { keyPath: 'id' })
        checks.createIndex('byResident', 'residentId')
        checks.createIndex('byCheckedAt', 'checkedAt')
      }
    },
  })

  const listeners = new Map<RecordStore, Set<() => void>>()
  const notify = (store: RecordStore) => listeners.get(store)?.forEach((listener) => listener())
  const codec = createCodec(encryption)

  return {
    encryption,
    residents: createRepository(db, 'residents', notify, codec),
    floodEvents: createRepository(db, 'floodEvents', notify, codec),
    exposures: createRepository(db, 'exposures', notify, codec),
    hingaChecks: createRepository(db, 'hingaChecks', notify, codec),
    stockLots: createRepository(db, 'stockLots', notify, codec),
    flags: createRepository(db, 'flags', notify, codec),
    approvals: createRepository(db, 'approvals', notify, codec),
    receivedPayloads: createRepository(db, 'receivedPayloads', notify, codec),
    pairedDevices: createRepository(db, 'pairedDevices', notify, codec),
    plans: createRepository(db, 'plans', notify, codec),
    watchChecks: createRepository(db, 'watchChecks', notify, codec),

    // Phase 2: the PIN lock's record and the wrong-PIN tries (vault.ts).
    async getLock(): Promise<LockRecord | null> {
      return ((await db.get('meta', 'lock')) as LockRecord | undefined) ?? null
    },
    async putLock(lock: LockRecord): Promise<void> {
      await db.put('meta', lock, 'lock')
    },
    async getLockAttempts(): Promise<LockAttempts> {
      return ((await db.get('meta', 'lockAttempts')) as LockAttempts | undefined) ?? { failures: 0, waitUntil: 0 }
    },
    async putLockAttempts(attempts: LockAttempts): Promise<void> {
      await db.put('meta', attempts, 'lockAttempts')
    },
    // Seals every plain record in the sealed stores with the session key (a
    // PIN set on a phone that already has records).
    async sealExisting(): Promise<number> {
      let count = 0
      for (const store of Object.keys(SEALED_FIELDS) as RecordStore[]) {
        const plain = ((await db.getAll(store)) as Stored[]).filter((record) => !record.sealed)
        if (!plain.length) continue
        const sealed = await Promise.all(plain.map((record) => codec.seal(store, record)))
        const tx = db.transaction(store, 'readwrite')
        await Promise.all([...sealed.map((record) => tx.store.put(record as never)), tx.done])
        count += sealed.length
        notify(store)
      }
      return count
    },

    // The phone's signing identity, or null before it's made.
    async getDeviceIdentity(): Promise<DeviceIdentity | null> {
      return (await db.get('deviceIdentity', 'self')) ?? null
    },
    async putDeviceIdentity(identity: DeviceIdentity): Promise<void> {
      await db.put('deviceIdentity', identity)
      notify('deviceIdentity')
    },
    // Hands out this phone's next export number and moves the counter on, in
    // one transaction, so two exports never share a number.
    async takeExportSeq(): Promise<number> {
      const tx = db.transaction('deviceIdentity', 'readwrite')
      const identity = await tx.store.get('self')
      if (!identity) {
        await tx.done
        throw new Error('This phone has no device identity yet.')
      }
      await tx.store.put({ ...identity, nextSeq: identity.nextSeq + 1 })
      await tx.done
      notify('deviceIdentity')
      return identity.nextSeq
    },

    async getSeedInfo(): Promise<SeedInfo | null> {
      return ((await db.get('meta', 'seed')) as SeedInfo | undefined) ?? null
    },

    // Tells the listener whenever a record in one of these stores is written.
    subscribe(stores: RecordStore[], listener: () => void): () => void {
      for (const store of stores) {
        if (!listeners.has(store)) listeners.set(store, new Set())
        listeners.get(store)!.add(listener)
      }
      return () => stores.forEach((store) => listeners.get(store)?.delete(listener))
    },

    // First run only: writes the synthetic seed, every record marked as sample
    // data, in one transaction. Returns whether it wrote anything.
    async loadSeed(seed: SeedData, now = new Date()): Promise<boolean> {
      if (await db.get('meta', 'seed')) return false
      // Sealed first: a transaction commits while awaiting crypto.
      const sample = <T>(store: RecordStore, records: T[] = []) =>
        Promise.all(records.map((record) => codec.seal(store, { ...record, sample: true })))
      const [residents, floodEvents, exposures, hingaChecks, stockLots] = await Promise.all([
        sample('residents', seed.residents),
        sample('floodEvents', seed.floodEvents),
        sample('exposures', seed.exposures),
        sample('hingaChecks', seed.hingaChecks),
        sample('stockLots', seed.stockLots),
      ])
      const tx = db.transaction(
        ['meta', 'residents', 'floodEvents', 'exposures', 'hingaChecks', 'stockLots'],
        'readwrite',
      )
      if (await tx.objectStore('meta').get('seed')) {
        await tx.done
        return false
      }
      const writes: Promise<unknown>[] = [
        ...residents.map((r) => tx.objectStore('residents').put(r as Resident)),
        ...floodEvents.map((r) => tx.objectStore('floodEvents').put(r as FloodEvent)),
        ...exposures.map((r) => tx.objectStore('exposures').put(r as Exposure)),
        ...hingaChecks.map((r) => tx.objectStore('hingaChecks').put(r as HingaCheck)),
        ...stockLots.map((r) => tx.objectStore('stockLots').put(r as StockLot)),
      ]
      const info: SeedInfo = {
        version: seed.version,
        municipality: seed.municipality,
        barangay: seed.barangay,
        loadedAt: now.toISOString(),
      }
      writes.push(tx.objectStore('meta').put(info, 'seed'))
      await Promise.all([...writes, tx.done])
      for (const store of ['residents', 'floodEvents', 'exposures', 'hingaChecks', 'stockLots'] as const) notify(store)
      return true
    },

    // For "Reset sample data": empties every record store and the seed marker
    // in one transaction, so loadSeed() runs again. Keeps this phone's signing
    // identity and any phone the laptop paired for real, unless resetPairing.
    // Never touches Cache Storage, so downloaded models stay.
    // resetLock (phase 2): also drops the PIN lock and its tries, for "Reset
    // sample data" (re-sealed with the demo PIN) and "Forgot the PIN?".
    async clearForReset({ resetPairing, resetLock = false }: { resetPairing: boolean; resetLock?: boolean }): Promise<void> {
      const records = [
        'residents',
        'floodEvents',
        'exposures',
        'hingaChecks',
        'stockLots',
        'flags',
        'approvals',
        'receivedPayloads',
        'plans',
        'watchChecks',
      ] as const
      const tx = db.transaction([...records, 'meta', 'pairedDevices', 'deviceIdentity'], 'readwrite')
      const paired = tx.objectStore('pairedDevices')
      const work: Promise<unknown>[] = [
        ...records.map((store) => tx.objectStore(store).clear()),
        tx.objectStore('meta').delete('seed'),
      ]
      if (resetLock) work.push(tx.objectStore('meta').delete('lock'), tx.objectStore('meta').delete('lockAttempts'))
      if (resetPairing) {
        work.push(paired.clear(), tx.objectStore('deviceIdentity').clear())
      } else {
        for (const device of await paired.getAll()) {
          if (device.source === 'seed') work.push(paired.delete(device.barangay))
        }
      }
      await Promise.all([...work, tx.done])
      for (const store of [...records, 'pairedDevices', 'deviceIdentity'] as const) notify(store)
    },

    close: () => db.close(),
  }
}

export type AgapayDb = Awaited<ReturnType<typeof openAgapayDb>>

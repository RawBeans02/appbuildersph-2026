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
} from './types'

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
}

export type RecordStore = Exclude<StoreNames<AgapaySchema>, 'meta'>

export const DB_NAME = 'agapay'
export const DB_VERSION = 2
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

function createRepository<S extends RecordStore>(
  db: IDBPDatabase<AgapaySchema>,
  store: S,
  notify: (store: RecordStore) => void,
) {
  type Value = StoreValue<AgapaySchema, S>
  return {
    get: (id: string): Promise<Value | undefined> => db.get(store, id),
    async put(record: Value): Promise<void> {
      await db.put(store, record)
      notify(store)
    },
    async putMany(records: Value[]): Promise<void> {
      const tx = db.transaction(store, 'readwrite')
      await Promise.all([...records.map((record) => tx.store.put(record)), tx.done])
      notify(store)
    },
    async delete(id: string): Promise<void> {
      await db.delete(store, id)
      notify(store)
    },
    count: (): Promise<number> => db.count(store),
    async list(options: ListOptions = {}): Promise<Value[]> {
      const range = options.after === undefined ? undefined : IDBKeyRange.lowerBound(options.after, true)
      return db.getAll(store, range, boundedLimit(options.limit))
    },
    async listBy(
      index: IndexNames<AgapaySchema, S>,
      value: string,
      options: { limit?: number } = {},
    ): Promise<Value[]> {
      return db.getAllFromIndex(store, index, IDBKeyRange.only(value), boundedLimit(options.limit))
    },
  }
}

export type Repository<S extends RecordStore> = ReturnType<typeof createRepository<S>>

export async function openAgapayDb(name = DB_NAME) {
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
    },
  })

  const listeners = new Map<RecordStore, Set<() => void>>()
  const notify = (store: RecordStore) => listeners.get(store)?.forEach((listener) => listener())

  return {
    residents: createRepository(db, 'residents', notify),
    floodEvents: createRepository(db, 'floodEvents', notify),
    exposures: createRepository(db, 'exposures', notify),
    hingaChecks: createRepository(db, 'hingaChecks', notify),
    stockLots: createRepository(db, 'stockLots', notify),
    flags: createRepository(db, 'flags', notify),
    approvals: createRepository(db, 'approvals', notify),
    receivedPayloads: createRepository(db, 'receivedPayloads', notify),
    pairedDevices: createRepository(db, 'pairedDevices', notify),
    plans: createRepository(db, 'plans', notify),

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
      const tx = db.transaction(
        ['meta', 'residents', 'floodEvents', 'exposures', 'hingaChecks', 'stockLots'],
        'readwrite',
      )
      if (await tx.objectStore('meta').get('seed')) {
        await tx.done
        return false
      }
      const sample = <T>(records: T[] = []) => records.map((record) => ({ ...record, sample: true }))
      const writes: Promise<unknown>[] = [
        ...sample(seed.residents).map((r) => tx.objectStore('residents').put(r)),
        ...sample(seed.floodEvents).map((r) => tx.objectStore('floodEvents').put(r)),
        ...sample(seed.exposures).map((r) => tx.objectStore('exposures').put(r)),
        ...sample(seed.hingaChecks).map((r) => tx.objectStore('hingaChecks').put(r)),
        ...sample(seed.stockLots).map((r) => tx.objectStore('stockLots').put(r)),
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
    async clearForReset({ resetPairing }: { resetPairing: boolean }): Promise<void> {
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
      ] as const
      const tx = db.transaction([...records, 'meta', 'pairedDevices', 'deviceIdentity'], 'readwrite')
      const paired = tx.objectStore('pairedDevices')
      const work: Promise<unknown>[] = [
        ...records.map((store) => tx.objectStore(store).clear()),
        tx.objectStore('meta').delete('seed'),
      ]
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

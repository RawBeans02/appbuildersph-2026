import type { AgapayDb } from '../../data/db/db'
import { MAX_LIMIT } from '../../data/db/db'
import { DEMO_SCAN_LABEL } from '../../data/seed/demoLabel'
import { generateSeed } from '../../data/seed/generate'
import { municipalSampleDevices } from '../../data/seed/municipal'
import { isStoragePersisted } from '../../lib/capabilities'
import { isModelCached } from '../../lib/modelCache'
import { partsWithModels } from '../../lib/modelParts'
import { modelBytes, offlineModels } from '../../lib/offlineModels'
import { PHASE2 } from '../../lib/phase2'
import type { ShellStatus } from '../../lib/pwa'
import { localToday } from '../../rules/dates'
import { lock } from '../lock/useLock'
import { wordingModelCached } from '../municipal/laptopAi'
import { isSameLot } from '../stock/stock'
import { expectFromSeed, sampleNumbers, type LaptopFacts, type PhoneFacts } from './readiness'

// Reads what readiness.ts judges, from this device: the service worker, the
// model cache, storage, the records and the permissions. Nothing leaves it.

async function phoneModels(): Promise<PhoneFacts['models']> {
  const models = offlineModels.filter((model) => model.device === 'phone')
  try {
    const cached = await Promise.all(models.map((model) => isModelCached(model)))
    const missing = partsWithModels(models)
      .filter((part) => part.models.some((model) => !cached[models.indexOf(model)]))
      .map((part) => part.short)
    return {
      cachedBytes: modelBytes(models.filter((_, i) => cached[i])),
      totalBytes: modelBytes(models),
      missing,
    }
  } catch {
    return null
  }
}

export async function gatherPhoneFacts(db: AgapayDb, shell: ShellStatus, now = new Date()): Promise<PhoneFacts> {
  const today = localToday(now)
  const [models, persisted, seedInfo, residents, exposures, lots, identity, lockRecord] = await Promise.all([
    phoneModels(),
    isStoragePersisted().catch(() => null),
    db.getSeedInfo(),
    db.residents.list({ limit: MAX_LIMIT }),
    db.exposures.list({ limit: MAX_LIMIT }),
    db.stockLots.list({ limit: MAX_LIMIT }),
    db.getDeviceIdentity(),
    PHASE2 ? db.getLock() : Promise.resolve(null),
  ])
  const demoLot = lots.find((lot) => isSameLot(lot, DEMO_SCAN_LABEL))
  return {
    today,
    shell: { status: shell, controlled: typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller },
    models,
    persisted,
    sample: seedInfo && {
      loadedOn: localToday(new Date(seedInfo.loadedAt)),
      numbers: sampleNumbers({ residents, exposures, lots }, today),
      expected: expectFromSeed(generateSeed(now), today),
    },
    demoLot: demoLot ? { id: demoLot.id, lot: demoLot.lot } : null,
    lock: PHASE2 ? { status: lock.getView().status, demoPin: lockRecord?.demoPin ?? null } : null,
    identity: identity && { exports: identity.nextSeq - 1 },
  }
}

async function cameraPermission(): Promise<LaptopFacts['camera']> {
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName })
    return status.state
  } catch {
    return null
  }
}

export async function gatherLaptopFacts(db: AgapayDb): Promise<LaptopFacts> {
  const [paired, received, aiCached, camera] = await Promise.all([
    db.pairedDevices.list({ limit: MAX_LIMIT }),
    db.receivedPayloads.list({ limit: MAX_LIMIT }),
    wordingModelCached().catch(() => null),
    cameraPermission(),
  ])
  const sampleCodes = new Set(municipalSampleDevices.map((device) => device.barangay))
  const receivedFrom = new Set(received.map((payload) => payload.barangay))
  return {
    sampleBarangays: {
      expected: sampleCodes.size,
      paired: paired.filter((device) => device.source === 'seed' && sampleCodes.has(device.barangay)).length,
      received: [...sampleCodes].filter((code) => receivedFrom.has(code)).length,
    },
    phonesPaired: paired.filter((device) => device.source === 'pairing').map((device) => device.barangay),
    aiCached,
    camera,
  }
}

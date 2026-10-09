// Encryption at rest for the personal fields on the phone (phase 2, behind
// VITE_PHASE2). A PIN of 4 to 6 digits and a random 16-byte salt derive an
// AES-GCM 256-bit key with PBKDF2-HMAC-SHA-256 (Web Crypto). The key is
// non-extractable and lives only in this page's memory, so the app locks on
// every reload. Each sealed value is AES-GCM with its own random 96-bit IV.
// The PIN itself is never stored: a "verifier" (a known constant sealed with
// the key) tells a right PIN from a wrong one.
//
// What it protects against: someone who picks up the phone, or copies the
// browser's storage, reading names, birth dates, households and health
// details. A 4–6 digit PIN has few combinations, so it slows a determined
// attacker with the stored data (each guess costs one PBKDF2 run) but can't
// stop one; the wrong-PIN delay only limits guesses typed into the app.

export const PBKDF2_ITERATIONS = 600_000
// Sample data only: the demo's records are sealed with this PIN, shown on the
// lock screen. Real records use the PIN the health worker sets.
export const DEMO_PIN = '2468'
const CHECK_TEXT = 'agapay-lock-check-v1'

export type SealedBox = { iv: Uint8Array; data: ArrayBuffer }

// Stored in the meta store under 'lock'. Everything here is safe to keep in
// the clear: without the PIN, the salt and the verifier don't give the key.
export type LockRecord = {
  v: 1
  kdf: 'PBKDF2-HMAC-SHA-256'
  iterations: number
  salt: Uint8Array
  check: SealedBox
  // The demo PIN when these are sample records, else null.
  demoPin: string | null
  createdAt: string
}

// Wrong-PIN tries, kept across reloads.
export type LockAttempts = { failures: number; waitUntil: number }

export class LockedError extends Error {
  constructor() {
    super('The records are locked: enter the PIN first.')
    this.name = 'LockedError'
  }
}

export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin)

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export async function deriveKey(pin: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function sealValue(key: CryptoKey, value: unknown): Promise<SealedBox> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)))
  return { iv, data }
}

// Throws if the key is wrong or the box was changed (AES-GCM's tag).
export async function openValue<T>(key: CryptoKey, box: SealedBox): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.iv as BufferSource }, key, box.data)
  return JSON.parse(decoder.decode(plain)) as T
}

export async function createLock(
  pin: string,
  { iterations = PBKDF2_ITERATIONS, demoPin = null, now = new Date() }: { iterations?: number; demoPin?: string | null; now?: Date } = {},
): Promise<{ lock: LockRecord; key: CryptoKey }> {
  if (!isValidPin(pin)) throw new RangeError('A PIN is 4 to 6 digits.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(pin, salt, iterations)
  const check = await sealValue(key, CHECK_TEXT)
  return { lock: { v: 1, kdf: 'PBKDF2-HMAC-SHA-256', iterations, salt, check, demoPin, createdAt: now.toISOString() }, key }
}

// The key for this PIN, or null when it's the wrong PIN.
export async function keyForPin(lock: LockRecord, pin: string): Promise<CryptoKey | null> {
  if (!isValidPin(pin)) return null
  const key = await deriveKey(pin, lock.salt, lock.iterations)
  try {
    return (await openValue<string>(key, lock.check)) === CHECK_TEXT ? key : null
  } catch {
    return null
  }
}

// The wait after a wrong PIN: none for the first two (typos), then 5 s,
// doubling each time, up to 5 minutes.
export function wrongPinDelayMs(failures: number): number {
  if (failures < 3) return 0
  return Math.min(5_000 * 2 ** (failures - 3), 5 * 60_000)
}

// The page's key while unlocked. Memory only: a reload starts locked.
let sessionKey: CryptoKey | null = null
export const session = {
  key: () => sessionKey,
  set(key: CryptoKey) {
    sessionKey = key
  },
  clear() {
    sessionKey = null
  },
}

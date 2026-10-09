import { fromBase64url, toBase64url } from './codec.js'
import { BARANGAY_PATTERN, MUNICIPALITY_PATTERN, isEpiWeek, isPlainObject } from './schema.js'
import { importPublicKey, keyFingerprint, signBytes, toPublicJwk, verifyBytes, type PublicJwk } from './sign.js'
import { isValidCount, type Count } from './suppress.js'

export type ReturnAction =
  | { kind: 'doctor-team'; barangay: string; watchCount: Count }
  | { kind: 'stock-transfer'; from: string; to: string; capsules: Count }

export type ReturnPacket = {
  version: 1
  approvalId: string
  municipality: string
  barangay: string
  epiWeek: string
  approvedAt: string
  approver: 'Municipal health officer'
  actions: ReturnAction[]
  publicJwk: PublicJwk
}

export const RETURN_PREFIX = 'AGPR1.'
export const MAX_RETURN_LENGTH = 2048
const encoder = new TextEncoder()
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))

export function validReturnPacket(value: unknown): value is ReturnPacket {
  if (!isPlainObject(value) || !exact(value, ['version', 'approvalId', 'municipality', 'barangay', 'epiWeek', 'approvedAt', 'approver', 'actions', 'publicJwk'])) return false
  if (value.version !== 1 || typeof value.approvalId !== 'string' || !/^[A-Za-z0-9:._-]{1,80}$/.test(value.approvalId)) return false
  if (typeof value.municipality !== 'string' || !MUNICIPALITY_PATTERN.test(value.municipality)) return false
  const place = (code: unknown): code is string => typeof code === 'string' && BARANGAY_PATTERN.test(code) && code.startsWith(`${value.municipality}-`)
  if (!place(value.barangay) || !isEpiWeek(value.epiWeek) || value.approver !== 'Municipal health officer') return false
  if (typeof value.approvedAt !== 'string' || !Number.isFinite(Date.parse(value.approvedAt)) || new Date(value.approvedAt).toISOString() !== value.approvedAt) return false
  if (!isPlainObject(value.publicJwk) || !exact(value.publicJwk, ['kty', 'crv', 'x', 'y']) || !toPublicJwk(value.publicJwk)) return false
  if (!Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 16) return false
  return value.actions.every((action) => {
    if (!isPlainObject(action)) return false
    if (action.kind === 'doctor-team') return exact(action, ['kind', 'barangay', 'watchCount']) && action.barangay === value.barangay && isValidCount(action.watchCount)
    return action.kind === 'stock-transfer' && exact(action, ['kind', 'from', 'to', 'capsules']) && place(action.from) && place(action.to) && action.from !== action.to && (action.from === value.barangay || action.to === value.barangay) && isValidCount(action.capsules) && action.capsules !== 0
  }) && new Set(value.actions.map((action) => JSON.stringify(action))).size === value.actions.length
}

function part(packet: ReturnPacket): string {
  const { publicJwk: key } = packet
  return toBase64url(encoder.encode(JSON.stringify([
    packet.version, packet.approvalId, packet.municipality, packet.barangay,
    packet.epiWeek, packet.approvedAt, packet.approver,
    packet.actions.map((a) => a.kind === 'doctor-team' ? ['d', a.barangay, a.watchCount] : ['s', a.from, a.to, a.capsules]),
    key.x, key.y,
  ])))
}

export async function encodeReturn(packet: ReturnPacket, privateKey: CryptoKey): Promise<string> {
  if (!validReturnPacket(packet)) throw new Error('The saved approval cannot be encoded as return instructions.')
  const signed = RETURN_PREFIX + part(packet)
  const text = `${signed}.${toBase64url(await signBytes(privateKey, encoder.encode(signed)))}`
  if (text.length > MAX_RETURN_LENGTH) throw new Error('These instructions are too large for one QR. Use the proven reporting flow.')
  return text
}

export type VerifiedReturn = { packet: ReturnPacket; fingerprint: string; text: string }

// No imported browser state: also usable by test and server tooling.
export async function decodeReturn(text: string, municipality: string, barangay: string): Promise<VerifiedReturn> {
  const trimmed = text.trim()
  if (!trimmed.startsWith(RETURN_PREFIX)) throw new Error(/^AGPR\d+\./.test(trimmed) ? 'This return QR version is unsupported.' : 'This is not an AgapayMo return QR.')
  if (trimmed.length > MAX_RETURN_LENGTH) throw new Error('The return QR is too large.')
  const parts = trimmed.slice(RETURN_PREFIX.length).split('.')
  const invalid = () => new Error('The return QR is malformed. Nothing was saved.')
  if (parts.length !== 2) throw invalid()
  const bytes = fromBase64url(parts[0])
  const signature = fromBase64url(parts[1])
  if (!bytes || !signature) throw invalid()
  let wire: unknown
  try { wire = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw invalid() }
  if (!Array.isArray(wire) || wire.length !== 10 || !Array.isArray(wire[7])) throw invalid()
  const packet: unknown = {
    version: wire[0], approvalId: wire[1], municipality: wire[2], barangay: wire[3], epiWeek: wire[4], approvedAt: wire[5], approver: wire[6],
    actions: wire[7].map((a: unknown) => Array.isArray(a) && a[0] === 'd' && a.length === 3 ? { kind: 'doctor-team', barangay: a[1], watchCount: a[2] } : Array.isArray(a) && a[0] === 's' && a.length === 4 ? { kind: 'stock-transfer', from: a[1], to: a[2], capsules: a[3] } : null),
    publicJwk: { kty: 'EC', crv: 'P-256', x: wire[8], y: wire[9] },
  }
  if (!validReturnPacket(packet) || part(packet) !== parts[0]) throw invalid()
  const key = await importPublicKey(packet.publicJwk)
  if (!key || !(await verifyBytes(key, encoder.encode(RETURN_PREFIX + parts[0]), signature))) throw new Error('The municipal signature is invalid. Nothing was saved.')
  if (packet.municipality !== municipality || packet.barangay !== barangay) throw new Error('These instructions are for another barangay. Nothing was saved.')
  return { packet, fingerprint: await keyFingerprint(packet.publicJwk), text: trimmed }
}

// The QR payload v1 module's public API; see README.md in this folder.
// Relative imports carry .js extensions so the module also runs as plain ES
// modules in Node (the phase 2 functions in api/ import it; see server/).
export {
  AGE_BANDS,
  BARANGAY_PATTERN,
  HINGA_AGE_BANDS,
  MUNICIPALITY_PATTERN,
  SCHEMA_VERSION,
  createPayload,
  isEpiWeek,
  isPlainObject,
  isoWeek,
  validatePayload,
  type AgeBand,
  type Counts,
  type CountsOf,
  type HingaAgeBand,
  type PayloadInput,
  type QrPayloadV1,
  type RawCounts,
} from './schema.js'
export {
  SUPPRESSED,
  countRange,
  formatCount,
  formatRange,
  isExact,
  isSuppressed,
  suppress,
  sumCounts,
  type Count,
  type CountRange,
} from './suppress.js'
export {
  SIGNATURE_BYTES,
  generateDeviceKeyPair,
  importPublicKey,
  keyFingerprint,
  signBytes,
  toPublicJwk,
  verifyBytes,
  type DeviceKeyPair,
  type KeyRegistry,
  type PublicJwk,
} from './sign.js'
export {
  QR_PREFIX,
  QrError,
  decodeQr,
  encodeQr,
  fromBase64url,
  toBase64url,
  type DecodeResult,
  type QrErrorCode,
} from './codec.js'
export { mergePayloads, type BarangayRow, type DuplicateReport, type MergeErrorCode, type MergeResult } from './merge.js'
export {
  PAIRING_PREFIX,
  decodePairing,
  encodePairing,
  isPairingText,
  type Pairing,
  type PairingErrorCode,
  type PairingResult,
} from './pairing.js'

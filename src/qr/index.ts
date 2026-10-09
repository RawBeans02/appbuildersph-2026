// The QR payload v1 module's public API; see README.md in this folder.
export {
  AGE_BANDS,
  HINGA_AGE_BANDS,
  SCHEMA_VERSION,
  createPayload,
  isoWeek,
  validatePayload,
  type AgeBand,
  type Counts,
  type CountsOf,
  type HingaAgeBand,
  type PayloadInput,
  type QrPayloadV1,
  type RawCounts,
} from './schema'
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
} from './suppress'
export {
  generateDeviceKeyPair,
  keyFingerprint,
  type DeviceKeyPair,
  type KeyRegistry,
  type PublicJwk,
} from './sign'
export { QR_PREFIX, QrError, decodeQr, encodeQr, type DecodeResult, type QrErrorCode } from './codec'
export { mergePayloads, type BarangayRow, type DuplicateReport, type MergeErrorCode, type MergeResult } from './merge'

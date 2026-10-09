# `src/qr/`: the de-identified QR payload, v1

Turns a barangay's counts into signed QR **text** on the phone, and back into verified, merged counts on the municipal laptop. Pure TypeScript, Web Crypto only (no library), runs in browsers and in Node 20+ (Vitest). No UI, no QR image rendering (the Send screen's QR library draws the text), no camera scanning (the municipal view's scanner hands over the text).

The phase 2 sync server (`server/`, `api/`) verifies every uploaded QR with this same `decodeQr`. Vercel runs it as plain ES modules in Node, so every relative import here ends in `.js` (`./schema.js` for `schema.ts`); `server/imports.test.ts` fails on one that doesn't.

Import everything from `src/qr` (`index.ts`).

## What leaves the phone
Counts only, for one barangay and one ISO week. No names, birthdates, household IDs, puroks or exact dates.

| Field | Wire key | Values |
|---|---|---|
| `version` | `v` | `1` |
| `municipality` | `m` | demo code, 3 capitals or digits, e.g. `SID` |
| `barangay` | `b` | the municipality code, a dash, 3 capitals or digits, e.g. `SID-MAL` |
| `epiWeek` | `wk` | ISO week, e.g. `2026-W41`, never a date |
| `seq` | `n` | this device's export number, from 1, one higher per export; the highest is the newest |
| `counts.exposed` | `e` | residents exposed to floodwater, by age band: `under2m`, `m2to12`, `y1to5`, `y5to17`, `y18to59`, `y60plus` (an array in that order on the wire) |
| `counts.inWatchWindow` | `w` | residents in the day 5–15 watch window now |
| `counts.fastBreathing` | `f` | Hinga fast-breathing referrals: `under2m`, `m2to12`, `y1to5` |
| `counts.urgentReferrals` | `u` | danger-sign (URGENT) referrals |
| `counts.doxyCapsulesOnHand` | `d` | doxycycline capsules on hand |
| `counts.doxyCapsulesExpiring6w` | `x` | of those, capsules expiring within 6 weeks |
| `counts.clinicianReviewFlags` | `r` | flags for clinician review |

Age bands are half-open: under 2 months, 2 up to 12 months, 1 up to 5 years, 5–17, 18–59, 60 and over.

The validator (`validatePayload`) rejects unknown or missing keys at every level, any text outside the fixed code and week patterns, and any count that isn't 0, `"<5"` or a whole number from 5 to 999,999. The decoder also accepts only the exact bytes this encoder writes, so spacing, reordered keys or a duplicate key (which `JSON.parse` would silently drop, hiding its text) are rejected even under a valid signature.

## Small numbers: `"<5"`
- `suppress(n)`: 0 stays 0, 1 to 4 become `"<5"`, 5 and up stay exact. `createPayload` applies it to every count, stock included (one rule, no exceptions to get wrong); `encodeQr` refuses an exact 1 to 4.
- Since 0 is never suppressed, `"<5"` always means 1 to 4. A sum is therefore a range: k `"<5"` cells plus an exact part E add up to E + k … E + 4k. `sumCounts` returns `{ min, max }`; `formatRange` shows `"17"` when exact and `"14–20"` otherwise. `formatCount` shows one cell as sent (`"<5"`).
- The payload has no totals, so a suppressed cell can't be worked out by subtracting the others from a total.

## The QR text
`AGP1.` + base64url(compact JSON) + `.` + base64url(ECDSA P-256 / SHA-256 signature, 64 bytes raw r‖s). The signature covers everything before the last dot, prefix included. All ASCII, so characters = bytes.

Measured in `codec.test.ts` (Vitest, Node 20): the realistic sample payload (`testFixtures.ts`) is **282 bytes**; the largest valid payload (every count and `seq` at 999,999) is **343 bytes**. Both are asserted under 800.

## Phone: the Send screen (A6)
```ts
import { createPayload, encodeQr, formatCount, generateDeviceKeyPair, isoWeek, keyFingerprint } from '../../qr'

// Once per device. Keep the CryptoKeys in IndexedDB as they are (the private
// key can't be exported). Show the fingerprint so the officer can compare it.
const device = await generateDeviceKeyPair()
const fingerprint = await keyFingerprint(device.publicJwk) // "3109-7D1D-0CAB-216B"

// Each export: raw counts from the rules, suppressed here. Store seq and add 1 every time.
const payload = createPayload({ municipality: 'SID', barangay: 'SID-MAL', epiWeek: isoWeek(new Date()), seq, counts })
// "What leaves this phone": show payload.counts with formatCount.
const text = await encodeQr(payload, device.privateKey) // hand this string to the QR renderer
```
`createPayload` throws a `RangeError` for raw counts with extra keys or non-whole numbers, or a bad code, week or seq.

## Laptop: the municipal view (B5)
```ts
import { decodeQr, formatCount, formatRange, mergePayloads, type KeyRegistry } from '../../qr'

const registry: KeyRegistry = { 'SID-MAL': publicJwk /* , ... */ } // barangay code → public JWK
const result = await decodeQr(scannedText, registry)
if (!result.ok) showError(result.code, result.message) // result.keyFingerprint on success

const merged = mergePayloads(verifiedPayloads) // same week and municipality
if (merged.ok) {
  merged.rows      // one per barangay, sorted by code, counts as sent ("<5" stays "<5")
  merged.totals    // same shape, each a { min, max } range: formatRange(merged.totals.inWatchWindow)
  merged.duplicates // [{ barangay, keptSeq, droppedSeqs }]: the highest seq is kept
}
```

| `decodeQr` error code | Meaning |
|---|---|
| `not-agapay` | Not an AgapayMo QR (a URL, a product barcode...) |
| `bad-version` | An AgapayMo QR of a version other than 1 |
| `invalid-payload` | Malformed, or breaks the schema (unknown keys, free text, unsuppressed counts, a date...) |
| `bad-signature` | The signature doesn't match the barangay's registered key (tampered, or another phone) |
| `unknown-device` | No usable key is registered for the barangay the QR names |

Once the payload has parsed, a `bad-signature` or `unknown-device` failure also carries `barangay`, the code the QR names (unverified: for the message, e.g. which barangay to pair, never for counts).

`mergePayloads` fails with `empty`, `mixed-epi-weeks` or `mixed-municipalities`.

## Pairing: a phone's key reaches the laptop once (`pairing.ts`)
Before its first counts QR, a barangay phone shows a **pairing QR** with its public key; the municipal laptop scans it, both screens show `keyFingerprint`, and the officer pairs the phone only after checking that the two match. The pairing QR has no signature (anyone could make one), so the fingerprint check is the trust step.

`AGPK1.` + base64url(compact JSON `{"x","y","b","m"}`): the P-256 public key's `x` and `y` (`kty` `EC` and `crv` `P-256` are implied), the barangay code `b` and the municipality code `m`, in that key order. Nothing else: no names, no private key (`encodePairing` reads only the public members, so even a private JWK's `d` never gets in). Every pairing QR is **173 characters** for any P-256 key and these code lengths (measured in `pairing.test.ts`, Vitest, Node 20).

```ts
// Phone (A6), once per device: show the pairing QR and the fingerprint.
import { encodePairing, keyFingerprint } from '../../qr'
const pairingText = encodePairing({ barangay: 'SID-MAL', municipality: 'SID', publicJwk: identity.publicJwk })
const fingerprint = await keyFingerprint(identity.publicJwk) // show it under the QR

// Laptop (B5): scan, show result.fingerprint, pair only after the officer confirms it matches.
import { decodePairing, isPairingText } from '../../qr'
if (isPairingText(scanned)) {
  const result = await decodePairing(scanned)
  if (result.ok) confirmThenStore(result.pairing.barangay, result.pairing.publicJwk, result.fingerprint)
}
```

| `decodePairing` error code | Meaning |
|---|---|
| `not-pairing` | Not a pairing QR (a counts QR, a URL...) |
| `bad-version` | A pairing QR of a version other than 1 |
| `invalid-pairing` | Malformed, extra or missing keys, not in canonical form, codes outside their patterns, or not a P-256 point |

`decodeQr` reads only `AGP<n>.` texts, so a pairing QR given to it is `not-agapay`; check `isPairingText` first.

## Limits
- Web Crypto needs a secure context (HTTPS or localhost); the live URL is HTTPS.
- The registry has to come from somewhere: the seed's pre-made QRs come with their public keys (B4); a live phone's `publicJwk` reaches the laptop once through the pairing QR above, with the fingerprint shown on both screens to compare.
- When an old and a newer QR from the same barangay are both scanned for the same week, the higher `seq` wins; a QR from another week is refused by the merge. There is no expiry beyond the week.

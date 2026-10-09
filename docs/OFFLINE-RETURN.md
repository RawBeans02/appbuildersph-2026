# Signed offline return instructions

Report → verify → approve → return QR → compare fingerprint → explicitly save → reload Home.
Works in the default offline core with `VITE_PHASE2` unset. The municipal signing
identity uses `agapay-sync`'s existing non-extractable ECDSA key, created without
enrollment, sync, an API call or a new model.

## Packet and trust

`AGPR1.<base64url canonical UTF-8 JSON>.<base64url signature>`.
The signature covers the prefix and payload. Version 1's compact array has a
fixed order: version, approval ID, municipality, recipient barangay, ISO reporting
week, ISO approval time, approving role, action tuples, public-key x, public-key y.
Action tuples are `['d', barangay, watchCount]` and
`['s', source, destination, capsulesUpTo]`. Only relevant actions from the saved
approved rules are included; edited wording is excluded. `<5` stays suppressed.
Exact counts 1–4, extra fields, noncanonical bytes, invalid key points, unsupported
versions, invalid signatures and different recipients are rejected. A packet is
bounded to 2,048 ASCII bytes and 16 actions; oversized approvals fail visibly.

The QR's key alone does not identify the municipality. A person compares the
displayed RFC 7638-derived fingerprint with the approving laptop before first
Save. Later receipts must use the same public key (both coordinates checked).
A changed key requires reset pairing and a fresh in-person comparison.

IndexedDB remains at version 3. Typed records live under `trustedMunicipalKeys`
and `receivedInstructions` in `meta`. Preview writes nothing. Save re-verifies
the text against the phone's current place and checks trust, duplicates and
recency inside one read/write transaction. Same approval and contents is an
idempotent receipt even when re-signed; reused IDs with different actions and
equal-time conflicting approvals are refused. Older approvals cannot replace
newer ones. Only the latest received approval is retained on this phone.

Sample reset clears instructions but preserves municipal trust; pairing reset
clears both. Neither reset deletes model caches or the laptop signing identity.
There is no receipt acknowledgement, completion tracking, inventory mutation,
clinical dose or edited free text in the return protocol.

## Limits and acceptance

This is a research prototype with synthetic records. A signature proves that a
key signed the action; it does not independently establish a human officer's
identity. Fingerprint comparison and role-based approval are local confirmations.
Recency uses the approving laptop's clock, not a time server. Verify that clock
before rehearsing. Browser storage can be cleared/evicted; no off-device backup
or key recovery is added. A compromised same-origin app/device can alter its
local data. QR density, glare, screen brightness and physical cameras still
require testing on the actual iPhone and Android. Multi-packet transport is not
supported. Large approvals use the proven existing core rather than claiming a
successful return.

Automated acceptance: unit packet/trust/reset/recency tests, 1,005-record
aggregation, and independent offline browser contexts for the complete loop.
Physical acceptance: after the final deploy, both phones must scan both
directions, save and reload without network; complete three consecutive full
rehearsals. Record evidence in `docs/FINAL-VALIDATION.md`. Until those checks pass,
the return feature is a candidate, and the proven reporting/approval core is
the submission fallback.

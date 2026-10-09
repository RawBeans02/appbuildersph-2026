# Final device and submission checklist

Written for PR #7 (branch `codex/offline-return-qr`, based on `ddc193e`, merged in 57cd84a); the device and rehearsal tables below are still the team's to fill.
This sheet separates automated desktop evidence from real-device evidence.
No iPhone/Android measurement, deployment, rehearsal or human contribution is
claimed until the team records it.

## Automated local checks completed

On the PR #7 branch (Windows desktop, local, Oct 9 22:43 PH): build and lint pass;
831 unit tests pass (3 existing skips); the default-core production browser suite
passes 26 tests (4 phase-2 checks skipped). The full
offline response loop passed across independent browser contexts, including
QR image receipt, duplicate/stale/key-change handling and offline persistence.
Actual local browser screenshots and the one-minute narration are prepared;
the final video remains pending. Detailed evidence and desktop-only timings
are in [Offline smoke test](OFFLINE-SMOKE-TEST.md) and
[Measurements](MEASUREMENTS.md).

## Device trials before deciding the live demo

Prepare each device online; record exact model, OS, browser and build from
`/device`. Turn airplane mode on with Wi-Fi and mobile data off, then reload.
Use the final deployed build rather than an older service worker.

Hinga: follow the existing [protocol](SPIKE-HINGA.md), including its setup and
safety instructions. Acceptance is 42–48 breaths/min in at least 4 of 5 trials
on each of an iPhone and Android, with refusals counted as failures. Record all
ten trials there. Use Hinga live only after both pass; otherwise demonstrate
the guided manual count and disclose that camera accuracy is unvalidated.

OCR: follow S2 in `TASKS.md`: five synthetic/own medicine-label photos on each
phone, after preparing and reloading offline. Lot and expiry must be read
correctly on at least 4 of 5 photos, within 5 s per photo, without tab reloads.
Record actual timings and the selected engine. If the iPhone fails, validate
the existing Tesseract comparison switch before enabling it; typing fields and
confirmation remain the fallback. Do not include patient data in trial photos.

| Device / OS / browser / build | Trial | Correct lot | Correct expiry | Read ms | Tab survived | Engine / notes |
|---|---|---|---|---|---|---|
| iPhone: pending | 1 | | | | | |
| iPhone: pending | 2 | | | | | |
| iPhone: pending | 3 | | | | | |
| iPhone: pending | 4 | | | | | |
| iPhone: pending | 5 | | | | | |
| Android: pending | 1 | | | | | |
| Android: pending | 2 | | | | | |
| Android: pending | 3 | | | | | |
| Android: pending | 4 | | | | | |
| Android: pending | 5 | | | | | |

Copy the real `/device` rows into [measurements](MEASUREMENTS.md). No desktop
timing belongs in the real-device table.

## Return acceptance after the final deploy

Keep phase 2 off for the main demo. Confirm the deployed build/commit. Use two
separate devices with no shared storage. Both must be prepared before going
offline. Start from reset synthetic data: mark HH-03/07/10, read the demo box,
enter quantity 30, confirm, and check 12 exposed / 40 stock / 30 expiring.

For each iPhone and Android, physically scan phone pairing/report on the
laptop; compare the phone fingerprint, verify and approve. Generate the return
QR for Maligaya-D; physically scan it on the phone, compare the municipal
fingerprint, preview and explicitly save. Close/reopen offline: Home retains
doctor-team and up-to-30-capsule transfer instructions. Stock remains 40.
Scan again: already saved. Check trust survives sample reset and clears on
pairing reset. The image/paste fallbacks must also be understandable.

| Final deployed build / date | Device | Phone → laptop camera | Laptop → phone camera | First trust | Saved + offline reload | Stock unchanged | Result / tester |
|---|---|---|---|---|---|---|---|
| Pending | iPhone | | | | | | |
| Pending | Android | | | | | | |

## Three consecutive rehearsals

Run the five-minute script from reset through phone receipt/reload, no network.
A failure resets the consecutive count. Check brightness, focus, glare and
camera permissions in the actual demonstration setup. Keep fallback screenshots,
QR image/text and the proven reporting/approval demo ready. If physical return
acceptance misses the deadline, submit that core without claiming the return
feature is validated on phones.

| Rehearsal | Build / devices / time | Complete offline loop | Under 5 minutes | No recovery needed | Tester / notes |
|---|---|---|---|---|---|
| 1: pending | | | | | |
| 2: pending | | | | | |
| 3: pending | | | | | |

## Submission evidence

- Confirm human contributions below and transfer only confirmed facts to README.
- Record the final one-minute video on the final devices if physical tests
  pass, with its evidence limits clearly labelled.
- Replace draft screenshot assets if the final deployment differs.
- Verify local/internet/model/tool/asset disclosures; no new model was added.
- Fill the final video link, social post URL and final deployed build. Publishing
  and social posting are team actions; no automated message has been sent.

| Team member | Confirmed human role and actual work | Evidence / member confirmation |
|---|---|---|
| Rovince Eduvane (RawBeans02) | Pending confirmation | |
| Vicente Seumal (ThirdyThirdy) | Pending confirmation | |
| Adam Arous (takashii18) | Pending confirmation | |
| Gabriel Syd Paguio (Syd7) | Pending confirmation | |

Codex implementation is disclosed separately in README. Git authorship and AI
session names do not establish a person's real contribution.

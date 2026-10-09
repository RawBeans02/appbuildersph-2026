# AgapayMo: offline response loop

## One-minute narration and shot list

Use real product footage, synthetic records, and visible offline status. Record
this narration or a team presenter for the submission version; the final video
is pending. Do not claim physical-camera
testing or accuracy from browser automation. Show the saved response in the
first ten seconds, then explain how it arrived.

| Time | Shot | Narration |
|---|---|---|
| 0–10 s | Saved instructions on Home, offline | “No signal. A barangay still has an approved response: a doctor team first, and up to thirty capsules from Riverside. This is AgapayMo.” |
| 10–20 s | Actual offline OCR review of the synthetic box | “For barangay health workers after a typhoon, medicine labels are read on the device. The worker checks the lot and expiry before saving.” |
| 20–30 s | Compare: 12 / 40 / 30; signed report | “Flood exposure and medicine stock stay on the phone. Only de-identified, signed counts go to the municipal laptop by QR.” |
| 30–40 s | Officer's structured plan and approval | “The officer verifies the report, reviews the fixed-rule priorities and approves. AI never sets a dose or decides the response.” |
| 40–50 s | Laptop return QR and phone fingerprint check | “Approved actions return by signed QR. On first use, the worker compares the municipal fingerprint, reviews the instructions and explicitly saves.” |
| 50–60 s | Home after offline reload | “The response survives an offline reload. Receipt does not change stock or mark work complete. One prepared app, a complete offline response loop.” |

Local AI proof is the real OCR inference, not the QR or fixed rules. Hinga may
be mentioned as a screening prototype, but use it live only when its iPhone and
Android gates pass. Optional local language-model wording and cloud features
stay outside this one-minute cut.

Optionally render a local silent draft after the complete-loop and OCR browser tests create
the screenshot files: set `PLAYWRIGHT_BROWSERS_PATH` if using a local browser
cache and `FFMPEG_PATH` to an ffmpeg executable with libvpx-vp9, then run
`node scripts/demo/render-video.mjs`. Output:
`docs/demo/agapaymo-one-minute.webm` (1920 × 1080, 60 s, captions, no audio).
The generated file is ignored by Git and kept locally. Record the
team narration and final deployed-device footage before posting.

## Five-minute demonstration

Before the clock: prepare phone and laptop online; confirm final build; download
models; reset samples; set brightness; verify clock and camera permissions;
turn Wi-Fi and data off; reload. Have the synthetic printed label and fallback
QR text/images ready. App data must visibly be labelled Sample data.

How the room sees both screens, with the network off on both:
- **The phone's screen:** QuickTime Player on the Mac, File → New Movie Recording, choose the iPhone as the camera, over a Lightning-to-USB-C cable. It works in airplane mode; iPhone Mirroring and AirPlay need Wi-Fi or Bluetooth, so don't rely on them.
- **The laptop's camera** for scanning the phone's QRs: the Mac's built-in FaceTime camera in Chrome. Allow camera access once before going offline.
- **The deck:** present it from the .pptx file, offline.
- **Backup:** a screen recording of one full rehearsal of the loop on these two devices, ready to play if anything fails live. Say it's a recording.

Laptop AI wording, after the final deploy (the worker's file changes with each
deploy, and offline drafting needs the current one cached): on the demo laptop,
online, do a normal reload, run one draft on `/municipal/plan`, and check that
the panel and the `/device` row are green before turning the network off.
Rehearse the five-barangay plan three times on that laptop; use the AI only
after the fifth report. Ship nothing under `src/features/municipal/llm/` or
`src/inference/` after that preparation.

1. **0:00–0:35 — User and problem.** “The barangay health worker after a typhoon
   needs an approved response even without signal.” Show offline Home. State
   synthetic prototype and no diagnosis/doses.
2. **0:35–1:35 — Local work and AI.** Mark HH-03, HH-07 and HH-10 exposed. Read
   the synthetic medicine label offline, confirm lot/expiry and quantity 30.
   Explain that the model runs locally, the worker checks it, and the photo is
   not retained. Show 12 exposed / 40 capsules / 30 expiring; flag for review.
3. **1:35–2:25 — Report and verification.** Phone pairing QR; officer compares
   fingerprints. Scan the report QR, verify it, show all five barangays. Point
   out `<5` suppression, no patient names and no network transport.
4. **2:25–3:10 — Human decision.** Show Maligaya-D as first doctor-team destination
   and Riverside-D → Maligaya-D up to 30 capsules. Explain the fixed rules and
   no doses. Approve without asking the optional wording model to load.
5. **3:10–4:10 — Return and trust.** Make return QR for Maligaya-D. Phone receives,
   verifies, compares the municipal fingerprint, previews and saves. Show that
   it is instructions, not an automatic stock adjustment or completion.
6. **4:10–4:45 — Persistence.** Reload Home offline; instructions remain. Scan
   the same return again: already saved. Show stock still 40. The log can
   reproduce instructions from that immutable approval.
7. **4:45–5:00 — Evidence and limits.** State actual device gates/results, not
   predictions. Storage eviction and physical QR conditions remain limits.
   Close: “Report, approve, respond, and keep working without internet.”

If OCR stalls, use the existing manual input and disclose the fallback. If
return acceptance fails, stop at the approved plan and use the proven existing
core; remove unsupported return claims from the final submission. If Hinga's
gate is unpassed, use the manual guided count outside the main timed loop.

# AgapayMo

An offline web app for barangay health workers after a typhoon: local medicine-box reading, a flood watch list and a breathing-screening prototype. A barangay reports de-identified counts by signed QR, the municipal officer approves a response, and the phone receives and saves signed instructions without internet.

Named Agapay until Oct 9, 9 PM, when the team renamed it AgapayMo (internal identifiers such as the database name keep "agapay"). Built for the **AppBuildersPH Hackathon 2026** (Oct 9–10, 2026). Theme: **Local AI**. The challenge: "Build an AI product that remains genuinely useful when the cloud disappears."

| | |
|---|---|
| **Team name** | Banana cue |
| **Live URL** | https://appbuildersph-2026.vercel.app |
| **Repository** | https://github.com/RawBeans02/appbuildersph-2026 |
| **Demo video** | _TBD_ |
| **X / LinkedIn post (video)** | _TBD_ |

> This README is filled in as the build lands. Sections marked _TBD_ are not done yet.

## The problem
After a typhoon, a flooded barangay can be without signal for days. That is exactly when its **barangay health workers** (BHWs, volunteers using their own phones) have the most to track:
- **Leptospirosis:** who waded through floodwater, so they can be watched for symptoms 5 to 15 days later. DOH counted 11,965 leptospirosis cases as of Sept 9, 2026, 46% more than the same period last year ([Daily Tribune, Sept 29, 2026](https://tribune.net.ph/2026/09/29/leptospirosis-cases-dip-slightly-but-2026-total-still-up-46)).
- **Children in the evacuation center:** which ones are breathing fast for their age, the WHO IMCI warning sign for pneumonia.
- **Doxycycline on hand:** how much there is, and how much expires soon.

The **municipal health officer** (MHO) decides where doctor teams and medicine go, but with paper records and no signal that picture arrives late. AgapayMo keeps all of it on the BHW's phone with no internet, and hands the MHO only the counts, by QR code.

## Try it
- **Live URL:** https://appbuildersph-2026.vercel.app
- **Offline test (phone or laptop):**
  1. Online, open the live URL and tap **Prepare for offline** (a one-time download of the on-device AI; sizes under "What requires internet").
  2. Turn on airplane mode and reload.
  3. **Phone:**
     - **Watch list:** tap households HH-03, HH-07 and HH-10, then confirm.
     - **Stock:** scan the synthetic demo label [`docs/demo/label-doxy-24A.png`](docs/demo/label-doxy-24A.png), shown on another screen, or type it in. Enter quantity 30 and confirm.
     - **Compare:** it shows "12 exposed · 40 … · 30 expire within 6 weeks". Flag it.
     - **Hinga:** check breathing with the camera, or count by hand.
     - **Send:** shows the QR.
  4. **Laptop (desktop Chrome):** open `/municipal`. Scan the phone's pairing QR, compare fingerprints, then scan its counts QR (photo and text fallbacks available). Merged view → Plan → Approve → **Make return QR** → choose Maligaya-D → Generate return QR. The complete synthetic demo directs the first doctor team and a transfer of up to 30 capsules from Riverside-D to Maligaya-D. The optional AI wording needs WebGPU and one online use first.
  5. **Phone:** Home or Send → **Receive RHU instructions**. Scan, choose a QR image, or paste the return text. Verify, compare the first municipal fingerprint with the laptop, review, then explicitly save. Reload Home offline: the instructions remain. Inventory stays at the demonstrated 40 capsules; receipt never marks a transfer complete. An existing approval can also generate its return QR from Approval log.
  6. `/device` → **Reset sample data** clears received instructions and restores today's sample records without re-downloading models. Reset pairing also clears municipal trust; compare the next fingerprint again.
- **Run or recreate it locally:** needs Node.js 20.19+ (or 22.12+) and npm.
  ```sh
  npm ci            # install the exact versions in package-lock.json
  npm run dev       # dev server (the service worker is off in dev)
  npm run build     # production build into dist/, including the service worker
  npm run preview   # serve dist/ locally to test the PWA and offline mode
  npm run typecheck && npm run lint && npm test
  npx playwright install chromium && npm run test:e2e   # offline e2e test (builds, serves, runs Chromium)
  npm run seed:municipal -- --week 2026-W42   # re-sign the 4 pre-made sample barangay QRs for another week (fresh keys, only public keys written)
  ```
- Any demo data in the app is invented sample data and is labeled as such.

## Offline response preview

Actual screenshots from the local production browser tests, with synthetic
records and the network disabled. These are desktop browser captures using a
phone viewport, not evidence of physical iPhone/Android trials.

<img src="docs/demo/offline-first-trust.png" width="300" alt="Return instructions preview and first municipal fingerprint comparison" />
<img src="docs/demo/offline-saved-instructions.png" width="300" alt="Instructions saved on Home after an offline reload" />

The [one-minute narration and five-minute script](docs/DEMO-SCRIPT.md) are
prepared. The final video recording and posted submission link remain pending.

## What runs locally
| Part | Runs on | Model / runtime |
|---|---|---|
| App shell (HTML, JS, CSS), cached by a service worker | The user's browser | No model yet |
| Records (residents, flood exposures, breathing checks, medicine stock, flags, approvals; on the municipal laptop also the paired phones' public keys, the received QR codes and the approved plans) | IndexedDB in the user's browser; they never leave the device except as the de-identified QR | No model |
| De-identified export (Send screen): counts by age band, small numbers shown as "<5", signed with the phone's own key and drawn as a QR | The user's browser (Web Crypto ECDSA P-256; the private key can't be read out) | No model |
| Approved return instructions (`AGPR1`): approval ID, municipality, recipient, reporting week, approval time/role, structured doctor-team and stock-transfer actions, municipal public key and signature; first trust requires fingerprint comparison; duplicate receipts are idempotent and older approvals cannot replace newer ones | ECDSA P-256 in the laptop and phone browsers; trusted keys and instructions in the existing IndexedDB metadata store. No cloud enrollment or phase 2 required | No model |
| Optional AI wording of the municipal plan (laptop): a small language model writes a short action summary from ordered priority names/scores and stock-transfer facts. The full rule-based plan remains available. A check rejects added numbers, dose/diagnosis terms, reordered priorities and missing or reversed transfers; this word-level check still requires officer review before approval | The laptop's GPU (WebGPU), in a Web Worker; without usable hardware WebGPU or on rejected output, the template wording is used | Qwen2.5-0.5B-Instruct on WebLLM |
| De-identified QR payload (`src/qr/`): small-cell suppression ("<5"), signing on the phone, verification and merge on the laptop, and the one-time pairing QR that carries a phone's public key (the officer compares its fingerprint) | The user's browser, with the built-in Web Crypto API (ECDSA P-256) | No model |
| Municipal laptop (`/municipal`, `/municipal/plan`, `/municipal/log`): reads the barangay QR codes from the laptop camera (or a photo, or pasted text), checks each signature against the paired phone's key, merges the barangays, computes the plan by fixed rules (doctor-team priority, doxycycline stock moves for the officer to decide, never a dose), and logs the officer's approval; camera frames are never stored or sent | The user's browser: the browser's built-in BarcodeDetector where it reads QR codes, else the bundled jsQR decoder; records in IndexedDB | No model: the plan is rules (the optional AI wording is the row above) |
| Medicine-box reader (Stock screen; also the `spike-ocr.html` test page): reads text from a photo of the box, taken in the app with the rear camera (or picked from the phone's photos when the camera isn't available), then drug, lot and expiry are parsed by rules for the health worker to confirm; the camera video and the photo are never stored or sent | The user's browser, in a Web Worker, WebAssembly, single-threaded | PP-OCRv5 mobile detection + English recognition on ONNX Runtime Web 1.30 |
| Hinga breathing check (`/hinga`): finds the torso in the rear-camera video and counts breaths per minute (band-pass, FFT peak, zero crossings), then compares with the WHO IMCI 2014 cut-offs; during the 60 s count, YAMNet listens for crying and the count is refused if it hears enough. The video and the microphone audio are processed piece by piece and never stored or sent; only the count, the outcome and the danger signs are saved on the phone | The user's browser: the pose model and YAMNet in WebAssembly on the CPU, each in a Web Worker (where a worker can't start, the pose model runs on the page itself and the screen says so); the breath counting in plain TypeScript | MediaPipe Pose Landmarker lite on MediaPipe Tasks Vision 1.0.1; YAMNet on MediaPipe Tasks Audio 1.0.1 |
| Hinga spike (`spike-hinga.html`, a test page not linked from the app): finds the torso in the rear-camera video, then counts breaths per minute from the torso's brightness and shoulder height (band-pass, FFT peak, zero crossings) and compares with the WHO IMCI 2014 cut-offs. The video is never stored or sent | The user's browser: the pose model in WebAssembly on the CPU, on the main thread (a spike shortcut); the breath counting in plain TypeScript | MediaPipe Pose Landmarker lite on MediaPipe Tasks Vision 1.0.1 |
| Flood watch list and exposure × stock (`/watch`, `/compare`): the day-5–15 leptospirosis watch window, residents watched, doxycycline on hand and expiring within 6 weeks, a flag for clinician review (never a dose) | The user's browser, records in IndexedDB | No model: fixed rules |
| iPhone fallback box reader, OFF by default (`TESSERACT_ON_IPHONE` in `src/inference/ocr/engine.ts`; `?engine=tesseract` on `/prepare` and `/stock` switches it on in that browser for testing) | The user's browser, in Tesseract.js's own worker | Tesseract.js with English data |

## What requires internet
| Part | Why it needs internet | What happens offline |
|---|---|---|
| First visit to the live URL | Downloads the app shell (HTML, JS, CSS). The offline-return candidate build precaches 136 entries, 1929.65 KiB (Workbox output; local build, default core). Includes the spike pages and bundled QR decoder; re-measure the final deployment at feature freeze | After the first visit, the app opens offline |
| Approved return instructions | No internet: the laptop signs locally and the phone verifies, compares the municipal fingerprint before first trust, previews and explicitly saves | Works after the app shell is prepared; saved instructions remain after offline reload. No cloud enrollment is required |
| "Prepare for offline" (one tap, once) | Downloads the on-device AI into the browser's Cache Storage: the ONNX Runtime WebAssembly file (14,239,897 bytes) and the PP-OCRv5 models with their dictionary (12,658,822 bytes) for the medicine-box reader; for Hinga, the MediaPipe vision and audio runtimes (18,913,890 bytes), the pose model and YAMNet (9,904,556 bytes). 55,717,165 bytes in all | After it, the models load from the device; without it, AI features need the network |
| First use of the AI wording on the municipal laptop (optional) | WebLLM downloads configuration, tokenizer and weights from huggingface.co and its WebGPU library from raw.githubusercontent.com; the service worker caches the app's wording worker. Offline readiness requires every required file for the GPU-selected f16/f32 variant. Persistent storage is requested best-effort; browser eviction can still remove files | Incomplete offline preparation shows a reconnect message and keeps the template and approval available. Real-model tests are opt-in; results and demonstration acceptance gates are in [docs/LLM-VALIDATION.md](docs/LLM-VALIDATION.md) |
| Hinga spike, "Download for offline" (one tap on `spike-hinga.html`) | Downloads the MediaPipe WebAssembly file (11,756,954 bytes) and the pose model (5,777,746 bytes), 17,534,700 bytes in all, into the browser's Cache Storage | After it, the spike page works in airplane mode; without it, the pose model needs the network |
| App updates | When a new version is deployed, the service worker fetches the new app shell on the next online visit | The cached version keeps working offline |
| Sync (phase 2, optional and secondary; only in a build with `VITE_PHASE2=1`): on the laptop's Sync screen (`/municipal/sync`), the municipal laptop uploads what it already holds when the internet returns | The laptop registers its own key once with an enroll code (`POST /api/enroll`), then sends the paired phones' public keys and the signed barangay QR texts it received (`POST /api/sync`), each request signed by the laptop. The server, Vercel Functions in `api/` with Postgres (Neon), verifies every QR's signature again and keeps de-identified counts only: codes, ISO weeks and counts with "<5" | Sync waits; scanning, merging, the plan and approvals work on the laptop as before. The offline core never calls the API |
| DOH view (phase 2, optional and secondary; `/doh`) | Reads the latest report per barangay from `GET /api/reports` with a view code; nothing is cached | Not available offline |
| Alerts (phase 2, optional and secondary): drafted for the DOH view from the synced counts, approved or rejected by a person | `POST /api/alerts-draft` builds each alert's facts and template wording on the server from the latest synced reports; when the owner turned GPT-6 Luna on (`LUNA_ENABLED`, a key, `LUNA_DAILY_LIMIT`), the server also asks OpenAI to reword each template and keeps the rewording only if it passes the check. `GET /api/alerts`, `POST /api/alerts-approve` and `/api/alerts-reject` list and decide them, behind the view code | Not available offline; with the AI off or unreachable, every alert uses its template wording |
| Inbox (phase 2, optional and secondary): approved alerts on the laptop's Sync screen (after each sync) and in the phone's "Messages from the municipality" card on Home | `POST /api/inbox`, signed by the laptop's enrolled key (its municipality's alerts) or by a phone's key that the laptop vouched for in a sync (its own barangay's alerts) | Nothing is pulled offline; nothing is stored, so offline there is nothing to show |

## Why does this product benefit from running AI locally?
- **It's needed when there is no signal.** The days after a typhoon are when phones have no data, and the health worker still has to check children and log exposures. Every AI step runs on the device: the camera breathing count, the cry check, the medicine-box reading, and the laptop's plan wording. Our CI tests run the app with the network cut off (see `e2e/`).
- **The data is about children and patients.** Names, birth dates and households never leave the phone. Only signed, de-identified counts move, from one screen to the other by QR. The core has no server; the optional phase 2 sync uploads only those same signed counts from the laptop, never a record.
- **The breathing count needs live video.** It reads a steady stream of camera frames for a full minute. Sending that to a server would be slow, costly on mobile data, and impossible offline.
- **No cost per use.** There are no API bills for a municipality, and it runs on the phones health workers already have.

## Related work
Camera-based breath counting for the WHO IMCI fast-breathing check has prior art: [Breathwise](https://devpost.com/software/breathwise-j9pfb4) (Devpost, RevenueCat Shipaton 2026), an open-source pediatric respiratory-rate project on GitHub ([tthitima53-del/pediatric-rr-](https://github.com/tthitima53-del/pediatric-rr-)), the AIRR research project (Malaria Consortium), and [Lucy et al. 2021](https://pubmed.ncbi.nlm.nih.gov/34715683/) (smartphone video in children with pneumonia). We found Breathwise after choosing this idea. AgapayMo Hinga is our own implementation, built from scratch during the hackathon; no code from these projects was used. What's different: an ML pipeline (pose-tracked torso region, on-device cry detection, a motion-quality gate that refuses unreliable counts) and the barangay workflow around it (flood exposure → leptospirosis watch list → medicine stock → de-identified QR → municipal plan), all offline.

Offline health record systems also exist (iClinicSys and SHINE OS+ have offline modes), and DOH runs eLMIS for medicine logistics and a leptospirosis and dengue case tracker. AgapayMo is meant to feed them, not replace them.

## Medical sources
- WHO IMCI fast-breathing cut-offs (≥60/min under 2 months, ≥50/min from 2 up to 12 months, ≥40/min from 12 months to 5 years) and danger signs: [WHO IMCI Chart Booklet, March 2014](https://cdn.who.int/media/docs/default-source/mca-documents/child/imci-integrated-management-of-childhood-illness/imci-in-service-training/imci-chart-booklet.pdf).
- Leptospirosis: symptoms 5 to 15 days after flood exposure, and doxycycline "may be given as prophylaxis to people exposed to floodwaters, but only after consultation with a health professional" (DOH Usec. Balboa, [Manila Times, Sept 3, 2026](https://www.manilatimes.net/2026/09/03/news/doh-leptospirosis-cases-in-ph-12-lower-than-last-year/2418017)). AgapayMo's watch window and its never-a-dose rule follow this.

## Architecture
One offline-first web app (Vite, React, TypeScript, a service worker), static on Vercel.
- **Phone screens:**
  - Records live in IndexedDB.
  - The models are downloaded once into Cache Storage and run in Web Workers: MediaPipe Pose and YAMNet for Hinga, PP-OCRv5 on ONNX Runtime Web (WebAssembly) for the medicine-box reader.
  - Fixed, unit-tested rules make every decision: the WHO IMCI cut-offs, the day-5–15 watch window, and the exposure × stock flag.
- **The handoff:** the phone shows a QR with de-identified counts, signed with its own ECDSA P-256 key, and the laptop scans it.
- **Laptop screens:** they verify each QR, merge the barangays and compute the plan by rules. An optional small language model (Qwen2.5-0.5B on WebLLM, WebGPU) only writes a short action summary of the plan the rules computed, under a check that rejects any new number, dose or barangay. The officer approves.

The diagram, the pipelines, the key decisions and the limitations are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Responsible AI
- **A research prototype and screening aid, not a registered medical device.**
  - It never diagnoses and never recommends a dose; its outputs refer people to the midwife, RHU or physician.
  - Doxycycline appears only as stock counts and a flag for clinician review, following DOH's advice that it be given only after consultation with a health professional (see Medical sources).
- **People decide; the AI suggests:**
  - The health worker confirms every field the box reader reads before anything is saved.
  - The officer edits and approves every plan.
  - The language model only summarizes a plan that fixed rules already computed.
- **Privacy by design:**
  - Records stay on the device. The core sends nothing to a server; the optional phase 2 sync sends only the laptop's de-identified QR counts and public keys.
  - The QR carries counts only: no names, birth dates, households, puroks or exact dates. Counts from 1 to 4 show as "<5", and the fields don't overlap, so a hidden cell can't be worked out by subtraction.
  - Photos, video and microphone audio are never stored or sent.
  - Phase 2's alerts (optional): a person approves or rejects every alert, by role, with the time, in an audit log; a wording the officer changed is tagged "Edited by the officer", not GPT-6 Luna's. The optional GPT-6 Luna wording (OpenAI, server-side) only ever sees one alert's de-identified facts (barangay codes and demo place names, the ISO week, counts with "<5", ranges) and its template, never a name or a record; every reworded alert, and every wording an officer edits, goes through the same positional check as the laptop's AI wording (no new number, dose, diagnosis, barangay or stock move), refuses any link or e-mail address and any character the templates don't use (so look-alike digits can't hide a number), and falls back to the template if it fails. Every alert keeps its kind's fixed safety caveats (a stock move only if the municipal health officer agrees, and doxycycline only after consultation with a health professional; a doctor team decides who needs care; a watch alert refers to the RHU): a reworded or edited text that leaves one out gets it appended. It's off unless `LUNA_ENABLED` is set, with `LUNA_DAILY_LIMIT` billed calls a day, at most 9 calls per draft request, per-address limits on drafting, a 20 s timeout and at most 2 retries. A new draft replaces the drafts still waiting, so an old one can't be approved later.
  - With phase 2 on (`VITE_PHASE2`), a PIN locks the phone's records: names, birth dates, households, puroks, flood notes and health details are encrypted at rest (AES-GCM 256-bit, a key derived from the PIN with PBKDF2-HMAC-SHA-256 at 600,000 iterations, kept in memory only). The exact scheme and its limits are in `docs/ARCHITECTURE.md` (Data and privacy).
- **Synthetic data only:** everything in the demo is invented ("San Isidro Demo", residents "Residente 001…") and labeled as sample data. We never tested on patients or children.
- **Honest about limits:** no accuracy figure is claimed for any model. Thresholds are first settings, and the limitations are listed in `docs/ARCHITECTURE.md`.

### Hinga, the breathing check
- **A screening aid, not a diagnosis.** Its only outputs are "fast breathing for age: refer" or "not fast breathing for age" against the WHO IMCI 2014 cut-offs, and "urgent" when the health worker ticks any of the WHO IMCI 2014 general danger signs (not able to drink or breastfeed, vomits everything, convulsions, lethargic or unconscious) or chest indrawing or stridor in a calm child. Referring urgently on chest indrawing and stridor is more cautious than IMCI 2014 (where chest indrawing alone at 2–59 months classifies as pneumonia), by design: the app only refers. The screen says "Screening aid only. Not a diagnosis."
- **It refuses rather than guesses:** when the child cries, the phone or child moves, the chest isn't visible, or its two ways of counting disagree, it shows the reason and offers one retry; after that it saves "not counted".
- **The pose model's own limits:** its model card (MediaPipe BlazePose GHUM 3D) says it "is not intended for human life-critical decisions", and lists a head that isn't visible as out of scope. Hinga uses it only to find the torso; the count and the refusals come from our signal processing, and the health worker decides.
- **Not tested on children.** The counting is tested on synthetic signals (unit tests); the phone trials, on adult team members only, are recorded in `docs/SPIKE-HINGA.md` as they happen. We don't claim any accuracy: none has been measured against a reference count.
- **First settings, not measured:** the thresholds for refusing (signal clarity, agreement, movement, crying) were set against synthetic data; the cry check's were not measured on real crying.
- **What stays on the phone:** the video and the microphone audio are processed piece by piece and dropped, never recorded, stored or sent. A saved check holds the age in months, the count (or the refusal), the outcome and the danger signs.

## Disclosures

### Models used
| Model | Parameters / quantization | Download size | Source | License |
|---|---|---|---|---|
| PP-OCRv5_mobile_det (text detection), ONNX export, used by the Stock screen's medicine-box reader (and the `spike-ocr.html` test page) | Not stated by the source | 4,826,518 bytes | ONNX: [ilaylow/PP_OCRv5_mobile_onnx](https://huggingface.co/ilaylow/PP_OCRv5_mobile_onnx) `ppocrv5_det.onnx` @ `f97b337`; original: [PaddlePaddle/PP-OCRv5_mobile_det](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det) | Apache-2.0 |
| en_PP-OCRv5_mobile_rec (English text recognition), ONNX export, used by the Stock screen's medicine-box reader (and the `spike-ocr.html` test page) | Parameters not stated; FP32, ONNX opset 11 (per the export's README and `config.json`) | 7,830,888 bytes, plus a 1,416-byte dictionary | ONNX: [monkt/paddleocr-onnx](https://huggingface.co/monkt/paddleocr-onnx) `languages/english/` @ `7b02d0a`; original: [PaddlePaddle/en_PP-OCRv5_mobile_rec](https://huggingface.co/PaddlePaddle/en_PP-OCRv5_mobile_rec) | Apache-2.0 |
| MediaPipe Pose Landmarker lite (BlazePose GHUM 3D lite: a pose detector and a 33-point landmark model), used by Hinga and the Hinga spike to find the torso | float16 (per the download path); parameters not stated by the source | 5,777,746 bytes | [Google MediaPipe model storage](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task), listed in the [Pose Landmarker docs](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker); [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) | Apache-2.0 (per the model card) |
| YAMNet (an audio event classifier with 521 classes, trained on AudioSet), used by Hinga to notice crying during the count | float32 (per the download path); parameters not stated by the source | 4,126,810 bytes | [Google MediaPipe model storage](https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite), listed in the [Audio Classifier docs](https://developers.google.com/edge/mediapipe/solutions/audio/audio_classifier); original: [tensorflow/models `research/audioset/yamnet`](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet) | Apache-2.0 (the tensorflow/models LICENSE covers `research/`) |
| Tesseract `eng` LSTM, `4.0.0_best_int`: fallback medicine-box reader for iPhone, **off** unless switched on in `src/inference/ocr/engine.ts` | Not stated by the source; integer-quantized ("best_int") | 2,952,873 bytes (gzip), plus the Tesseract.js worker (111,307 bytes) and its core with WebAssembly built in (3,899,472 bytes) | [`@tesseract.js-data/eng`](https://www.npmjs.com/package/@tesseract.js-data/eng) 1.0.0; original: [tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata) | Apache-2.0 (data), MIT (npm package) |
| Qwen2.5-0.5B-Instruct, WebLLM build `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (`q4f32_1` when the GPU lacks shader-f16): the optional AI wording of the municipal plan, laptop only | 0.5B parameters (model name); 4-bit weights (WebLLM `q4f16_1` / `q4f32_1`) | _TBD (measured on first run)_ | Weights: [mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC); WebGPU library: [mlc-ai/binary-mlc-llm-libs](https://github.com/mlc-ai/binary-mlc-llm-libs); original: [Qwen/Qwen2.5-0.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) | Apache-2.0 (the original model). The MLC conversion and library repositories state no license of their own |
| GPT-6 Luna (OpenAI, `gpt-6-luna`, or the model named in `OPENAI_CHAT_MODEL`): the optional phase 2 alert wording, called server-side only (`server/luna/draft.ts`), never by the browser and never by the offline core. Off unless the owner sets `LUNA_ENABLED`, a key and a daily limit (`LUNA_DAILY_LIMIT`); otherwise every alert uses its template wording. It gets one alert's facts (barangay codes and demo place names, the ISO week, counts as sent with "<5", ranges) and the template, nothing else; its reply is checked like the laptop's AI wording and a person approves every alert | Not stated by OpenAI (closed model) | None: it runs in OpenAI's cloud | [OpenAI API](https://platform.openai.com), Chat Completions | Proprietary (OpenAI's terms). The one closed model, disclosed as the exception in `CLAUDE.md` |

Self-hosted, unmodified: the OCR models in `public/models/ppocr/` and the pose model and YAMNet in `public/models/mediapipe/`, each with checksums, sources and the license text in a README there.

### Technologies and frameworks
React + TypeScript, built with Vite as an installable web app (PWA: vite-plugin-pwa / Workbox service worker). On-device storage in IndexedDB (idb). Inference in Web Workers on WebAssembly (ONNX Runtime Web, MediaPipe Tasks, Tesseract.js) and, on the laptop only, WebGPU (WebLLM). Browser APIs: Cache Storage, Web Crypto (ECDSA P-256), camera (getUserMedia), BarcodeDetector. The optional phase 2 sync (off unless built with `VITE_PHASE2`) adds Vercel Functions (Node.js, Web-standard Request/Response) in `api/` with Postgres through node-postgres. Tests: Vitest and Playwright in GitHub Actions, with axe-core for automated accessibility checks, and a Postgres 16 service container for the API tests. Small build scripts in Python with Pillow (synthetic labels). Every library and its license is in the table below.

### APIs and cloud services
- **Vercel:** static hosting of the app and the self-hosted model files. For the optional phase 2 sync only (off unless built with `VITE_PHASE2=1`), small Vercel Functions in `api/` (enroll, sync, reports, health, and for the alerts alerts-draft, alerts, alerts-approve, alerts-reject and inbox); the offline core never calls them.
- **Neon Postgres (through Vercel's Neon integration):** phase 2 sync only. Stores the enrolled laptops' public keys, the phone public keys they vouch for, and the de-identified barangay reports (codes, ISO weeks, export numbers and counts with "<5"), plus nonces, rate-limit windows (a keyed hash of the address, kept at most an hour) and an audit log of actions and result counts. Never a name, birth date, household, purok or exact date of a person.
- **Hugging Face and raw.githubusercontent.com:** only the first use of the optional AI wording on the municipal laptop downloads WebLLM's model weights and WebGPU library from them.
- **GitHub:** the repository and CI (GitHub Actions); not used by the app.
- **OpenAI Images API (gpt-image-2):** used during development only, for the placeholder photos and illustration listed under AI development tools; the app never calls it.
- **OpenAI API (GPT-6 Luna):** phase 2 alerts only, called from the server (`server/luna/draft.ts`), never from the browser, and only when `LUNA_ENABLED`, `OPENAI_API_KEY` and `LUNA_DAILY_LIMIT` are set. It receives one alert's de-identified facts and its template wording, and returns wording only; a timeout, at most 2 retries and the daily limit bound each request.
- **No cloud AI** in the offline core: every model the phone and the laptop run is on the device.

### Existing code and assets
- **Process docs only, no product code,** written Oct 8 before the event and committed unchanged in `b6c93e5` (Oct 9, 1:00:31 PM PH): `.gitignore`, `CLAUDE.md`, `TASKS.md`, `ONE-PAGER.md`, `RULES.md`, `QUALITY.md`. `QUALITY.md` was condensed from a generic build-quality checklist the team keeps (not from any product; not included here). Every commit from `8c5f100` on is work done during the event.
- **Prepared beforehand and kept outside this repo, no product code:** planning notes, the instructions for our research chat and agents, and a laptop memory-guard script (not needed to build or run the product). The research itself ran after the 1:00 PM reveal.
- **First product code:** commits before `3f00b06` are process docs only; the first product code is `3f00b06` (Oct 9, 2:00:40 PM PH).
- **Other products:** the team has built other products before this event; no code, data, prompts, designs or assets from them are used here.
- **Designs:** the screens, tokens, copy, components and app icons in `design/` were made with Claude Design during the event (pass 1 landed in `7397da7`). The photos in `design/assets/` are mockup placeholders made with OpenAI gpt-image-2; they never ship in the app.
- **Algorithms we reimplemented:** the OCR pre- and post-processing (`src/inference/ocr/`: DB box extraction and CTC decoding) follows PaddleOCR's published reference algorithms (Apache-2.0), written fresh in TypeScript. The seed's random generator is mulberry32, a public-domain algorithm by Tommy Ettinger (`src/data/seed/generate.ts`).
- **Launch splashes and logo lockups** (`public/splash/`, `design/brand/`): made during the event with a script from Claude Design's app icon and the Atkinson Hyperlegible Next font (OFL); no AI image generation.
- **Fonts, icons, images and other third-party assets,** with their licenses:
  - Fonts: Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono (Braille Institute of America), SIL Open Font License 1.1. The woff2 files were downloaded from Google Fonts and are self-hosted in `public/fonts/` with their license texts, so they work offline.
  - Icons in the UI: Phosphor Icons (`@phosphor-icons/react`, MIT; see Open-source libraries).
  - App icons (`public/icons/`): made with Claude Design during the event (`design/icons/`).
  - The synthetic test label `src/inference/ocr/fixtures/label.ppm` was rendered during the event with Pillow's bundled font, Aileron Regular (CC0). Its text is invented.
  - The synthetic demo label `docs/demo/label-doxy-24A.png` (the box scanned in the demo's stock step) was rendered during the event by `scripts/demo-label/make_label.py` with the same font, Aileron Regular (CC0). Its text is invented, with no brand, logo or company, and it is marked "DEMO · NOT A REAL MEDICINE · SAMPLE DATA".

### AI development tools
Every AI session that touched this project:
- **Claude Code** (Anthropic, Opus 5.5): the **Lead** (planning, reviews, CI, docs and parts of the app) and the **Sr. Builder** (core implementation), each a Claude Code session, plus their subagents. Their commits start with `lead:` and `sr:`. The Claude co-author line on commits is the AI tool, not a person.
- **Subagents** (Claude Code): review and verification subagents review only. From Sat ~12:30 AM, the Lead also ran building subagents, each in its own git worktree, for design pass 2 (the intro, Home, the box-reader overlay, the laptop live hub, the Receive restyle and the motion details). The Lead reviewed and merged every change, and their commits carry the `lead:` prefix.
- **The owner's separate Claude session ("Account Admin", an AI):** drafted the pre-event process docs on Oct 8, sets up and monitors the laptop (starts the agent sessions, watches memory), relays briefing details, and runs read-only audits; it writes no product code.
- **Claude** (chat, Research mode): research and idea selection.
- **Claude Design**: the UI design, pass 1 (Fri) and pass 2 "alive and goal-first" (Sat ~3:38 AM: the intro, the story-led Home, the laptop live hub, motion, and the SVG art: brand tile and loop drawing), from briefs written by the Lead and Account Admin; the return-flow screens by Codex follow its tokens and components. The pass 2 screens were built from the brief's written spec shortly before the frames arrived, then checked against them. The inline copies of the Claude Design SVGs (`BrandTile`, `LoopArt`) drop their C2PA metadata for size only; the originals with their Content Credentials are in `design/svg/`.
- **OpenAI Codex (GPT-6)**: repository review and the `codex/offline-return-qr` implementation: signed offline return packets, municipal trust and receipt screens extending the existing design, persistence/reset rules, loading cancellation/timeout and pagination fixes, Windows test portability, synthetic fixture updates, browser verification and submission materials. See `design/Offline Return QR.md` for the new screen specification. No additional model is added to the app.
- **OpenAI Codex with three GPT-6 Luna agents at max reasoning**: the [PR #8](https://github.com/RawBeans02/appbuildersph-2026/pull/8) work: complete active-model cache readiness, offline preparation errors, compact fact-copying prompts, regression tests and real local-model trials. Results and rejected cases are disclosed in `docs/LLM-VALIDATION.md`. The app still uses the existing Qwen model.
- **OpenAI gpt-image-2** (development only, not shipped in the app): placeholder photos inside the Claude Design mockups (a chest in a camera view, a hand holding a synthetic "SAMPLE" medicine box, a phone held up to a webcam), and one illustration of a flooded street for the video and pitch, labeled "AI illustration" wherever it appears. Prompts, model and dates are kept with the files; every image was checked by a person. Screenshots of the product in this README are real screenshots of the working app.

A cloud "Jr. Builder" agent named in early commits was planned but never used.

## Open-source libraries
| Library | Used for | License |
|---|---|---|
| [React](https://react.dev) and React DOM | UI | MIT |
| [Phosphor Icons](https://phosphoricons.com) (`@phosphor-icons/react`) | The UI's icons (Bold; Fill for the active tab) | MIT |
| [Vite](https://vite.dev) | Dev server and production build | MIT |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | React support in Vite | MIT |
| [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) | Web app manifest and service worker (offline app shell) | MIT |
| [Workbox](https://github.com/GoogleChrome/workbox) (via vite-plugin-pwa) | Service worker precaching, shipped in `sw.js` | MIT |
| [TypeScript](https://www.typescriptlang.org) | Type checking | Apache-2.0 |
| [Vitest](https://vitest.dev) | Unit tests | MIT |
| [Playwright](https://playwright.dev) (`@playwright/test`) | End-to-end offline test in CI (Chromium) | Apache-2.0 |
| [axe-core](https://github.com/dequelabs/axe-core) with [`@axe-core/playwright`](https://github.com/dequelabs/axe-core-npm) (4.13.0) | Automated accessibility check (WCAG 2.0/2.1 A and AA rules) of every screen in the CI end-to-end tests (`e2e/a11y.spec.ts`); development only, not shipped | MPL-2.0 |
| [ESLint](https://eslint.org), `@eslint/js`, [typescript-eslint](https://typescript-eslint.io), `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals` | Linting | MIT |
| `@types/react`, `@types/react-dom`, `@types/node` ([DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)) | Type definitions | MIT |
| [WebLLM](https://github.com/mlc-ai/web-llm) (`@mlc-ai/web-llm`) | Runs the optional AI wording model on the laptop's GPU (WebGPU), in a worker | Apache-2.0 |
| [Tesseract.js](https://github.com/naptha/tesseract.js) (`tesseract.js`, `tesseract.js-core`) | Fallback medicine-box reader for iPhone, off unless switched on (`src/inference/ocr/engine.ts`) | Apache-2.0 |
| [`@tesseract.js-data/eng`](https://www.npmjs.com/package/@tesseract.js-data/eng) | English data for that fallback (a packaging of Tesseract's `eng` LSTM model) | MIT (package); the data is Apache-2.0 |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | Draws the de-identified QR on the Send screen | MIT |
| [jsQR](https://github.com/cozmo/jsQR) (`jsqr` 1.4.0) | Reads QR codes from the municipal laptop's camera in browsers without the built-in BarcodeDetector; bundled with the app, so it works offline | Apache-2.0 |
| [idb](https://github.com/jakearchibald/idb) | Promise wrapper for IndexedDB, the on-device records | ISC |
| [node-postgres](https://node-postgres.com) (`pg` 8.23, with its dependencies `pg-pool`, `pg-protocol`, `pg-types`, `pg-connection-string`, `pgpass`, `pg-cloudflare`, `postgres-array`, `postgres-bytea`, `postgres-date`, `postgres-interval`, `xtend` (MIT) and `split2`, `pg-int8` (ISC)) | Postgres client for the optional phase 2 sync API (`server/db.ts`); server only, never in the app the browser loads | MIT |
| `@types/pg` ([DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)) | Type definitions for node-postgres (development only) | MIT |
| [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) | In-memory IndexedDB for unit tests (development only) | Apache-2.0 |
| [ONNX Runtime Web](https://onnxruntime.ai) (`onnxruntime-web`) | On-device model inference (WebAssembly) for the medicine-box reader | MIT |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) (`@mediapipe/tasks-vision` 1.0.1) | On-device pose landmarks (WebAssembly, CPU) for Hinga and the Hinga spike; its WebAssembly builds are copied into the site at build time (`npm run copy:mediapipe`), never loaded from a CDN | Apache-2.0 |
| [MediaPipe Tasks Audio](https://github.com/google-ai-edge/mediapipe) (`@mediapipe/tasks-audio` 1.0.1) | On-device audio classification (WebAssembly) for Hinga's cry check; copied into the site at build time the same way | Apache-2.0 |
| [Pillow](https://python-pillow.org) | Renders the synthetic test label (`src/inference/ocr/fixtures/make_label.py`) and the synthetic demo label (`scripts/demo-label/make_label.py`); a development tool, not shipped | MIT-CMU |

## Lighthouse (mobile, measured at feature freeze)
Measured with Lighthouse 12.8.2 (mobile emulation, simulated throttling), the same lab test PageSpeed Insights runs, by the on-demand GitHub Actions workflow `.github/workflows/lighthouse.yml` against the live URL. The full report is kept as the run's artifact.

| Run | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| [Fri Oct 9, 6:09 PM PH](https://github.com/RawBeans02/appbuildersph-2026/actions/runs/37915694829), median of 3 runs (Performance 66, 99, 99) | 99 | 100 | 100 | 100 |
| [Fri Oct 9, 5:58 PM PH](https://github.com/RawBeans02/appbuildersph-2026/actions/runs/37914606334), single run, before the `robots.txt` and first-load fixes | 86 | 100 | 100 | 91 |

Single runs vary on GitHub's shared runners (one of the three runs above scored 66, with 2,120 ms of blocking time), so we report the median of three and show every run. Re-measured at the feature freeze; the latest median is the one that counts. Accessibility is also checked on every push by axe-core on 14 screens (`docs/MEASUREMENTS.md`, method 6).

## Team

Contribution confirmation and the final physical-device/rehearsal checklist are
in [`docs/FINAL-VALIDATION.md`](docs/FINAL-VALIDATION.md). The one-minute narration
and five-minute demonstration are in [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md).
Human rows stay pending until each member's actual work is confirmed.
| Name (as on appbuildersph.com/hackathon/participants) | GitHub | Role | Contributions |
|---|---|---|---|
| Rovince Eduvane | RawBeans02 | Build lead | _TBD_ |
| Vicente Seumal | ThirdyThirdy | Support: idea creation and design | _TBD_ |
| Adam Arous | takashii18 | Support: idea creation and design | _TBD_ |
| Gabriel Syd Paguio | Syd7 | Co-builder | The signed offline return QR from the laptop's approval to the barangay phone ([PR #7](https://github.com/RawBeans02/appbuildersph-2026/pull/7), with OpenAI Codex), and the local LLM cache and prompt fixes and their validation ([PR #8](https://github.com/RawBeans02/appbuildersph-2026/pull/8), with OpenAI Codex); more _TBD_ |

The original core was built with the Lead and Sr. Builder AI sessions under the owner's direction. The offline return QR (PR #7) and the local LLM fixes (PR #8) add the Codex work disclosed above; PR #8's commit b015507 has no AI co-author line but is Codex work too. AI tools and Git authorship do not establish a person's actual contribution; the human contribution rows remain pending confirmation in `docs/FINAL-VALIDATION.md`.

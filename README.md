# _Project name (TBD, from ONE-PAGER.md)_

_Short description (TBD): one sentence on who it helps and what it does without the cloud._

Built for the **AppBuildersPH Hackathon 2026** (Oct 9–10, 2026). Theme: **Local AI**. The challenge: "Build an AI product that remains genuinely useful when the cloud disappears."

| | |
|---|---|
| **Team name** | _TBD (exactly as on the official participant list)_ |
| **Live URL** | https://appbuildersph-2026.vercel.app |
| **Repository** | https://github.com/RawBeans02/appbuildersph-2026 |
| **Demo video** | _TBD_ |
| **X / LinkedIn post (video)** | _TBD_ |

> This README is filled in as the build lands. Sections marked _TBD_ are not done yet.

## The problem
_TBD: the target user, the problem, and why it matters._

## Try it
- **Live URL:** https://appbuildersph-2026.vercel.app
- **Offline test:** open the live URL once and wait until the model shows as ready. Then turn on airplane mode, reload, and use it. _(Exact steps TBD.)_
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

## What runs locally
| Part | Runs on | Model / runtime |
|---|---|---|
| App shell (HTML, JS, CSS), cached by a service worker | The user's browser | No model yet |
| Records (residents, flood exposures, breathing checks, medicine stock, flags, approvals; on the municipal laptop also the paired phones' public keys, the received QR codes and the approved plans) | IndexedDB in the user's browser; they never leave the device except as the de-identified QR | No model |
| De-identified export (Send screen): counts by age band, small numbers shown as "<5", signed with the phone's own key and drawn as a QR | The user's browser (Web Crypto ECDSA P-256; the private key can't be read out) | No model |
| Optional AI wording of the municipal plan (laptop): a small language model rewords the rule-based plan; a check rejects any draft that changes a number, adds a dose, a diagnosis or a barangay, or reorders priorities, and the officer edits and approves either way | The laptop's GPU (WebGPU), in a Web Worker; without WebGPU the template wording is used | Qwen2.5-0.5B-Instruct on WebLLM |
| De-identified QR payload (`src/qr/`): small-cell suppression ("<5"), signing on the phone, verification and merge on the laptop, and the one-time pairing QR that carries a phone's public key (the officer compares its fingerprint) | The user's browser, with the built-in Web Crypto API (ECDSA P-256) | No model |
| Municipal laptop (`/municipal`, `/municipal/plan`, `/municipal/log`): reads the barangay QR codes from the laptop camera (or a photo, or pasted text), checks each signature against the paired phone's key, merges the barangays, computes the plan by fixed rules (doctor-team priority, doxycycline stock moves for the officer to decide, never a dose), and logs the officer's approval; camera frames are never stored or sent | The user's browser: the browser's built-in BarcodeDetector where it reads QR codes, else the bundled jsQR decoder; records in IndexedDB | No model: the plan is rules (an optional local model to draft its wording is not built yet) |
| Medicine-box reader (Stock screen; also the `spike-ocr.html` test page): reads text from a photo of the box, then drug, lot and expiry are parsed by rules for the health worker to confirm; the photo is never stored | The user's browser, in a Web Worker, WebAssembly, single-threaded | PP-OCRv5 mobile detection + English recognition on ONNX Runtime Web 1.30 |
| Hinga breathing check (`/hinga`): finds the torso in the rear-camera video and counts breaths per minute (band-pass, FFT peak, zero crossings), then compares with the WHO IMCI 2014 cut-offs; during the 60 s count, YAMNet listens for crying and the count is refused if it hears enough. The video and the microphone audio are processed piece by piece and never stored or sent; only the count, the outcome and the danger signs are saved on the phone | The user's browser: the pose model and YAMNet in WebAssembly on the CPU, each in a Web Worker (where a worker can't start, the pose model runs on the page itself and the screen says so); the breath counting in plain TypeScript | MediaPipe Pose Landmarker lite on MediaPipe Tasks Vision 1.0.1; YAMNet on MediaPipe Tasks Audio 1.0.1 |
| Hinga spike (`spike-hinga.html`, a test page not linked from the app): finds the torso in the rear-camera video, then counts breaths per minute from the torso's brightness and shoulder height (band-pass, FFT peak, zero crossings) and compares with the WHO IMCI 2014 cut-offs. The video is never stored or sent | The user's browser: the pose model in WebAssembly on the CPU, on the main thread (a spike shortcut); the breath counting in plain TypeScript | MediaPipe Pose Landmarker lite on MediaPipe Tasks Vision 1.0.1 |
| _TBD: the on-device AI_ | | |

## What requires internet
| Part | Why it needs internet | What happens offline |
|---|---|---|
| First visit to the live URL | Downloads the app shell (HTML, JS, CSS: 1065.75 KiB, Workbox's precache figure in the build), which the service worker caches. 485.88 KiB of it is the Hinga spike page and its MediaPipe loader script, and 164,487 bytes the municipal laptop screens with their QR reader (130,108 of them jsQR) (`ls -l` on the build output) | After the first visit, the app opens offline |
| "Prepare for offline" (one tap, once) | Downloads the on-device AI into the browser's Cache Storage: the ONNX Runtime WebAssembly file (14,239,897 bytes) and the PP-OCRv5 models with their dictionary (12,658,822 bytes) for the medicine-box reader; for Hinga, the MediaPipe vision and audio runtimes (18,913,890 bytes), the pose model and YAMNet (9,904,556 bytes). 55,717,165 bytes in all | After it, the models load from the device; without it, AI features need the network |
| First use of the AI wording on the municipal laptop (optional) | WebLLM downloads the model weights from huggingface.co and its WebGPU library from raw.githubusercontent.com, and caches them in the browser; the app's 6 MB worker for it is cached by the service worker at the same time | Afterwards it runs with no network; never used it online: the panel says the AI is unavailable and the template wording is used |
| Hinga spike, "Download for offline" (one tap on `spike-hinga.html`) | Downloads the MediaPipe WebAssembly file (11,756,954 bytes) and the pose model (5,777,746 bytes), 17,534,700 bytes in all, into the browser's Cache Storage | After it, the spike page works in airplane mode; without it, the pose model needs the network |
| _TBD_ | | |

## Why does this product benefit from running AI locally?
_TBD: the answer, true to the code._

## Related work
Camera-based breath counting for the WHO IMCI fast-breathing check has prior art: Breathwise (Devpost, RevenueCat Shipaton 2026), the AIRR research project (Malaria Consortium), and Lucy et al. 2021 (smartphone video in children with pneumonia). We found Breathwise after choosing this idea. Agapay Hinga is our own implementation, built from scratch during the hackathon; no code from these projects was used. What's different: an ML pipeline (pose-tracked torso region, on-device cry detection, a motion-quality gate that refuses unreliable counts) and the barangay workflow around it (flood exposure → leptospirosis watch list → medicine stock → de-identified QR → municipal plan), all offline.

Offline health record systems also exist (iClinicSys and SHINE OS+ have offline modes), and DOH runs eLMIS for medicine logistics and a leptospirosis and dengue case tracker. Agapay is meant to feed them, not replace them.

## Architecture
_TBD: a summary here; the diagram, decisions, the on-device AI pipeline and its limitations will be in `docs/ARCHITECTURE.md`._

## Responsible AI
_Draft, filled in as features land._

### Hinga, the breathing check
- **A screening aid, not a diagnosis.** Its only outputs are "fast breathing for age: refer" or "not fast breathing for age" against the WHO IMCI 2014 cut-offs, and "urgent" when the health worker ticks a danger sign (chest indrawing, stridor, unable to drink, convulsions, very sleepy or hard to wake). The screen says "Screening aid only. Not a diagnosis."
- **It refuses rather than guesses:** when the child cries, the phone or child moves, the chest isn't visible, or its two ways of counting disagree, it shows the reason and offers one retry; after that it saves "not counted".
- **The pose model's own limits:** its model card (MediaPipe BlazePose GHUM 3D) says it "is not intended for human life-critical decisions", and lists a head that isn't visible as out of scope. Hinga uses it only to find the torso; the count and the refusals come from our signal processing, and the health worker decides.
- **Not tested on children.** The counting is tested on synthetic signals (unit tests); the phone trials, on adult team members only, are recorded in `docs/SPIKE-HINGA.md` as they happen. We don't claim any accuracy: none has been measured against a reference count.
- **First settings, not measured:** the thresholds for refusing (signal clarity, agreement, movement, crying) were set against synthetic data; the cry check's were not measured on real crying.
- **What stays on the phone:** the video and the microphone audio are processed piece by piece and dropped, never recorded, stored or sent. A saved check holds the age in months, the count (or the refusal), the outcome and the danger signs.

## Disclosures

### Models used
| Model | Parameters / quantization | Download size | Source | License |
|---|---|---|---|---|
| PP-OCRv5_mobile_det (text detection), ONNX export, used by the OCR spike | Not stated by the source | 4,826,518 bytes | ONNX: [ilaylow/PP_OCRv5_mobile_onnx](https://huggingface.co/ilaylow/PP_OCRv5_mobile_onnx) `ppocrv5_det.onnx` @ `f97b337`; original: [PaddlePaddle/PP-OCRv5_mobile_det](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det) | Apache-2.0 |
| en_PP-OCRv5_mobile_rec (English text recognition), ONNX export, used by the OCR spike | Parameters not stated; FP32, ONNX opset 11 (per the export's README and `config.json`) | 7,830,888 bytes, plus a 1,416-byte dictionary | ONNX: [monkt/paddleocr-onnx](https://huggingface.co/monkt/paddleocr-onnx) `languages/english/` @ `7b02d0a`; original: [PaddlePaddle/en_PP-OCRv5_mobile_rec](https://huggingface.co/PaddlePaddle/en_PP-OCRv5_mobile_rec) | Apache-2.0 |
| MediaPipe Pose Landmarker lite (BlazePose GHUM 3D lite: a pose detector and a 33-point landmark model), used by Hinga and the Hinga spike to find the torso | float16 (per the download path); parameters not stated by the source | 5,777,746 bytes | [Google MediaPipe model storage](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task), listed in the [Pose Landmarker docs](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker); [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) | Apache-2.0 (per the model card) |
| YAMNet (an audio event classifier with 521 classes, trained on AudioSet), used by Hinga to notice crying during the count | float32 (per the download path); parameters not stated by the source | 4,126,810 bytes | [Google MediaPipe model storage](https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite), listed in the [Audio Classifier docs](https://developers.google.com/edge/mediapipe/solutions/audio/audio_classifier); original: [tensorflow/models `research/audioset/yamnet`](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet) | Apache-2.0 (the tensorflow/models LICENSE covers `research/`) |
| Tesseract `eng` LSTM, `4.0.0_best_int`: fallback medicine-box reader for iPhone, **off** unless switched on in `src/inference/ocr/engine.ts` | Not stated by the source; integer-quantized ("best_int") | 2,952,873 bytes (gzip), plus the Tesseract.js worker (111,307 bytes) and its core with WebAssembly built in (3,899,472 bytes) | [`@tesseract.js-data/eng`](https://www.npmjs.com/package/@tesseract.js-data/eng) 1.0.0; original: [tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata) | Apache-2.0 (data), MIT (npm package) |
| Qwen2.5-0.5B-Instruct, WebLLM build `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (`q4f32_1` when the GPU lacks shader-f16): the optional AI wording of the municipal plan, laptop only | 0.5B parameters (model name); 4-bit weights (WebLLM `q4f16_1` / `q4f32_1`) | _TBD (measured on first run)_ | Weights: [mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC); WebGPU library: [mlc-ai/binary-mlc-llm-libs](https://github.com/mlc-ai/binary-mlc-llm-libs); original: [Qwen/Qwen2.5-0.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) | Apache-2.0 (the original model). The MLC conversion and library repositories state no license of their own |

Self-hosted, unmodified: the OCR models in `public/models/ppocr/` and the pose model and YAMNet in `public/models/mediapipe/`, each with checksums, sources and the license text in a README there.

### Technologies and frameworks
_TBD_

### APIs and cloud services
_TBD_

### Existing code and assets
- **Process docs only, no product code,** written Oct 8 before the event and committed unchanged in `b6c93e5` (Oct 9, 1:00:31 PM PH): `.gitignore`, `CLAUDE.md`, `TASKS.md`, `ONE-PAGER.md`, `RULES.md`, `QUALITY.md`. `QUALITY.md` was condensed from a generic build-quality checklist the team keeps (not from any product; not included here). Every commit from `8c5f100` on is work done during the event.
- **Prepared beforehand and kept outside this repo, no product code:** planning notes, the instructions for our research chat and agents, and a laptop memory-guard script (not needed to build or run the product). The research itself ran after the 1:00 PM reveal.
- **First product code:** commits before `3f00b06` are process docs only; the first product code is `3f00b06` (Oct 9, 2:00:40 PM PH).
- **Other products:** the team has built other products before this event; no code, data, prompts, designs or assets from them are used here.
- **Designs:** the UI designs, tokens and images in `design/` were generated with Claude Design during the event.
- **Fonts, icons, images and other third-party assets,** with their licenses: _TBD (listed as they are added)_.
  - The synthetic test label `src/inference/ocr/fixtures/label.ppm` was rendered during the event with Pillow's bundled font, Aileron Regular (CC0). Its text is invented.
  - The synthetic demo label `docs/demo/label-doxy-24A.png` (the box scanned in the demo's stock step) was rendered during the event by `scripts/demo-label/make_label.py` with the same font, Aileron Regular (CC0). Its text is invented, with no brand, logo or company, and it is marked "DEMO · NOT A REAL MEDICINE · SAMPLE DATA".

### AI development tools
Every AI session that touched this project:
- **Claude Code** (Anthropic, Opus 5.5): the **Lead** (planning, reviews, CI, docs and parts of the app) and the **Sr. Builder** (core implementation), each a Claude Code session, plus their subagents. Their commits start with `lead:` and `sr:`. The Claude co-author line on commits is the AI tool, not a person.
- **Review and verification subagents** (Claude Code): review only; they write no code.
- **The owner's separate Claude session ("Account Admin", an AI):** drafted the pre-event process docs on Oct 8, sets up and monitors the laptop (starts the agent sessions, watches memory), relays briefing details, and runs read-only audits; it writes no product code.
- **Claude** (chat, Research mode): research and idea selection.
- **Claude Design**: all UI design.

A cloud "Jr. Builder" agent named in early commits was planned but never used.

## Open-source libraries
| Library | Used for | License |
|---|---|---|
| [React](https://react.dev) and React DOM | UI | MIT |
| [Vite](https://vite.dev) | Dev server and production build | MIT |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | React support in Vite | MIT |
| [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) | Web app manifest and service worker (offline app shell) | MIT |
| [Workbox](https://github.com/GoogleChrome/workbox) (via vite-plugin-pwa) | Service worker precaching, shipped in `sw.js` | MIT |
| [TypeScript](https://www.typescriptlang.org) | Type checking | Apache-2.0 |
| [Vitest](https://vitest.dev) | Unit tests | MIT |
| [Playwright](https://playwright.dev) (`@playwright/test`) | End-to-end offline test in CI (Chromium) | Apache-2.0 |
| [ESLint](https://eslint.org), `@eslint/js`, [typescript-eslint](https://typescript-eslint.io), `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals` | Linting | MIT |
| `@types/react`, `@types/react-dom`, `@types/node` ([DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)) | Type definitions | MIT |
| [WebLLM](https://github.com/mlc-ai/web-llm) (`@mlc-ai/web-llm`) | Runs the optional AI wording model on the laptop's GPU (WebGPU), in a worker | Apache-2.0 |
| [Tesseract.js](https://github.com/naptha/tesseract.js) (`tesseract.js`, `tesseract.js-core`) | Fallback medicine-box reader for iPhone, off unless switched on (`src/inference/ocr/engine.ts`) | Apache-2.0 |
| [`@tesseract.js-data/eng`](https://www.npmjs.com/package/@tesseract.js-data/eng) | English data for that fallback (a packaging of Tesseract's `eng` LSTM model) | MIT (package); the data is Apache-2.0 |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | Draws the de-identified QR on the Send screen | MIT |
| [jsQR](https://github.com/cozmo/jsQR) (`jsqr` 1.4.0) | Reads QR codes from the municipal laptop's camera in browsers without the built-in BarcodeDetector; bundled with the app, so it works offline | Apache-2.0 |
| [idb](https://github.com/jakearchibald/idb) | Promise wrapper for IndexedDB, the on-device records | ISC |
| [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) | In-memory IndexedDB for unit tests (development only) | Apache-2.0 |
| [ONNX Runtime Web](https://onnxruntime.ai) (`onnxruntime-web`) | On-device model inference (WebAssembly) for the OCR spike | MIT |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) (`@mediapipe/tasks-vision` 1.0.1) | On-device pose landmarks (WebAssembly, CPU) for Hinga and the Hinga spike; its WebAssembly builds are copied into the site at build time (`npm run copy:mediapipe`), never loaded from a CDN | Apache-2.0 |
| [MediaPipe Tasks Audio](https://github.com/google-ai-edge/mediapipe) (`@mediapipe/tasks-audio` 1.0.1) | On-device audio classification (WebAssembly) for Hinga's cry check; copied into the site at build time the same way | Apache-2.0 |
| [Pillow](https://python-pillow.org) | Renders the synthetic test label (`src/inference/ocr/fixtures/make_label.py`) and the synthetic demo label (`scripts/demo-label/make_label.py`); a development tool, not shipped | MIT-CMU |

## Lighthouse (mobile, measured at feature freeze)
_TBD: Performance, Accessibility, Best Practices and SEO, measured on pagespeed.web.dev against the live URL._

## Team
| Name (as on appbuildersph.com/hackathon/participants) | GitHub | Role | Contributions |
|---|---|---|---|
| Rovince Eduvane | RawBeans02 | Build lead | _TBD_ |
| Vicente Seumal | ThirdyThirdy | _TBD_ | _TBD_ |
| Adam Arous | _TBD_ | _TBD_ | _TBD_ |
| Gabriel Syd Paguio | Syd7 | _TBD_ | _TBD_ |

Teammates commit under their own GitHub accounts; no one outside the team commits.

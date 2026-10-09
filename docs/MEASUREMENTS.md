# Measurements

Every number on a slide, in the video, in the README or in the app comes from one of the methods below, with the device named. **A timing from a CI runner is a CI-runner number, never phone speed.** Nothing here is an estimate presented as a result.

## Methods

### 1. On-device timings: `/device`, "Measure this device"
On the device being measured, with internet on, open the live URL's `/prepare` and tap "Prepare for offline" until it says Ready. Then turn on airplane mode, reload `/device` (so the first load is cold), type the device name, and tap each button once. "Copy as a table row" gives one row for the results table below; paste it in.

| Column | What is timed (`performance.now()`, on that device) |
|---|---|
| OCR load | Starting the box reader on this page: its worker, ONNX Runtime with its `.wasm`, and the PP-OCRv5 models, read from the model cache. "already loaded" when the reader was started earlier on the page. |
| OCR first read | The first read of the bundled synthetic demo label (`public/demo/label-doxy-24A.png`): decode and downscale, detection, recognition, and label parsing. |
| OCR warm read | The median of the next 3 reads of the same label. |
| Label read right | Whether every read found the label's lot (`DEMO-LOT-24A`) and expiry (2026-11). |
| Pose start cold / warm | Starting the pose model (MediaPipe Pose Landmarker lite) for the first, then the second time on the page: the worker and the model, read from the model cache. "Pose runs" says whether it ran in the worker or fell back to the page, and why. |
| Pose fps | Pose detections completed per second over 10 s of the live back camera, each frame awaited before the next: the rate Hinga's count can sample at. The median time per detection is shown next to it. |
| Cry check start | Starting the cry check: its worker and the YAMNet model, read from the model cache. |

### 2. File and download sizes
- Model and runtime files: `ls -l` on the files in `public/models/` and on the runtime files in `node_modules/` (`onnxruntime-web/dist/ort-wasm-simd-threaded.wasm`, the MediaPipe `.wasm` files). The exact byte counts are in each feature's `models.ts`, and `models.node.test.ts` tests fail if they don't match the files.
- "Prepare for offline" total: the sum of those byte counts, which `/prepare` shows.
- First visit (the app shell): Workbox's `precache N entries (X KiB)` line in the `npm run build` output (local or in the CI log).
- The laptop's AI wording model: the MB WebLLM reports as fetched, shown in the plan screen's AI panel when its first download finishes (README Models table: _TBD_ until that first run).

### 3. QR sizes
Vitest (Node 20) in CI. In `src/qr/codec.test.ts`, the realistic sample payload is 282 bytes of QR text and the largest valid one 343. `src/qr/pairing.test.ts` measures the pairing QR at 173 characters for any P-256 key.

### 4. CI-runner timings (runner numbers only)
- `e2e/ocr-offline.spec.ts` logs the stock screen's line, for example "Read on this phone in 1.2 s, after 0.6 s loading the reader for the first time", from headless Chromium on a GitHub Actions `ubuntu-latest` runner.
- The CI-only model tests (`*.model.test.ts`) log detection and recognition milliseconds in Node on the same runner.
- They show the pipeline runs end to end with no network. They are not phone speed and are never quoted as such.

### 5. Hinga accuracy
The trial protocol, kill criterion and results tables are in `docs/SPIKE-HINGA.md` (Lead).

## Results from real devices

Fill in from method 1 ("Copy as a table row"). One row per device and run.

| Date | Device | Browser (user agent) | Backend | OCR engine | OCR load ms | OCR first read ms | OCR warm read ms (median) | Label read right | Pose start cold ms | Pose start warm ms | Pose runs | Pose fps (10 s) | Pose infer ms (median) | Cry check start ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | iPhone 14 Pro Max | | | | | | | | | | | | | |
| | iPhone 13 Pro Max | | | | | | | | | | | | | |
| | Samsung (model: _fill in_) | | | | | | | | | | | | | |
| | MacBook Air M2 (municipal laptop) | | | | | | | | | | | | | |

## Recorded so far

| When | Number | Where it came from | Device |
|---|---|---|---|
| Oct 9, CI run 37905165994 | Demo label read offline: "Read on this phone in 1.2 s, after 0.6 s loading the reader for the first time" | `e2e/ocr-offline.spec.ts` log | GitHub Actions runner (not a phone) |
| Oct 9, CI run 37904919331 | The same test: 1.4 s, after 0.7 s loading | `e2e/ocr-offline.spec.ts` log | GitHub Actions runner (not a phone) |
| Oct 9, CI run 37897385876 | PP-OCRv5 on the synthetic label in Node: detection 366 ms, recognition 334 ms | `ocr.model.test.ts` log | GitHub Actions runner (not a phone) |
| Oct 9 | Hinga's first pose model start: 6894 ms, in a background worker | Shown on `/hinga`, reported by the owner | The owner's laptop browser (exact laptop and browser to be filled in) |

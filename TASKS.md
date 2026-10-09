# TASKS — source of truth for who does what

Tags: `[lead]` `[sr]` (Sr. Builder, local) `[devin]` (Devin, optional) `[human:<name>]`. There is no Jr. Builder for this build; the Lead and the Sr. Builder both build.
Status: `todo` → `doing` → `done` (pushed to `main`, with the commit hash)
Under a task: `BLOCKED: <question>` · `NEEDS DESIGN: <screen/state>`
Every task names the files or folders it **owns**, so agents pushing straight to `main` don't collide.

**Live URL:** _(fill in after the first deploy)_  ·  **Scope check:** 12:00 AM  ·  **Feature freeze:** 4:00 AM  ·  **Submit by:** 9:00 AM (hard close 10:00 AM Sat, code freeze; no pushes after 9:45 AM)

**Designs:** all UI comes from Claude Design: `design/` (exports, tokens, copy + `design/README.md`). Link the screen on every UI task; no UI task starts before its screen exists.

**Model:** Opus 5.5 for every agent. **Effort:** Lead ultracode · Sr. ultracode. If an agent hits a usage limit, the Lead reassigns its open tasks here.

**Stack (locked Fri ~2:00 PM):** Vite + React + TypeScript as an offline-first PWA (`vite-plugin-pwa`), static on Vercel, npm. The on-device model runtime (WebLLM, transformers.js / ONNX Runtime Web, MediaPipe…) is picked with the idea; don't install one before that.

**Heavy checks:** the hosting build and GitHub Actions CI run in the cloud on every push. Locally, heavy jobs go through the guard, one at a time across both agents (`CLAUDE.md`).

**Judging (official weights, `RULES.md`):** Problem & Usefulness 25% · Local AI Implementation 25% · Technical Execution 20% · Innovation 15% · Product & Demo Quality 15%. Every wow-flow task must also work with the network off (`QUALITY.md`, "Local AI").

## Now (the wow flow)
- [ ] todo · Claude Design pass 1: design system (tokens) + every wow-flow screen in all states (default, loading, empty, error), **plus the model download/initialization progress, "running on this device" and offline indicator states** → `design/` + `design/README.md` · [lead] · owns: `design/`
- [ ] doing · Scaffold + first deploy, **idea-agnostic, no designed UI** (~30–45 min) · [sr] · owns: `package.json`, the lockfile, `vite.config.ts`, `tsconfig*.json`, the ESLint config, `index.html`, `vercel.json`, `public/`, `src/main.tsx`, `src/App.tsx` (placeholder), `src/lib/`, `docs/OFFLINE-SMOKE-TEST.md`, `docs/DEPLOY.md`
  - Vite + React + TS; npm scripts `dev`, `build`, `preview`, `typecheck`, `lint`, `test` (Vitest, with at least one real test) so CI can call them.
  - PWA shell with `vite-plugin-pwa`: manifest, service worker precaching the app shell, and an offline fallback. The hello page is a plain, unstyled placeholder (no product name, no theme, no shadcn).
  - `src/lib/capabilities.ts`: WebGPU present (and an adapter available), `navigator.deviceMemory` where supported, storage estimate, `navigator.storage.persist()`. Unit-tested.
  - `src/lib/useOnlineStatus.ts`: online/offline status hook.
  - `vercel.json`: SPA fallback, plus the COOP/COEP headers written in but commented out (or behind a flag) until a runtime needs them.
  - Done differently: JSON has no comments and Vercel rejects unknown keys, so the COOP/COEP block waits, ready to paste, in `docs/DEPLOY.md` (with the `credentialless` vs `require-corp` and service-worker caveats). The placeholder page shows "Cross-origin isolated: yes/no" to check it after.
  - NEEDS DESIGN: app icon (192 and 512 px PNG, plus a maskable version), favicon, and the manifest name/short name/theme and background colors. The manifest has a placeholder name, white colors and no icons until then, so browsers won't offer to install it yet; the offline shell works without them.
  - `docs/OFFLINE-SMOKE-TEST.md`: load the live URL, go offline, reload, the shell still works. Run it on the first deploy and record the result (device, browser) under this task.
  - `npm install` and production builds only through the guard.
  - Hosting: **Vercel, a NEW project on the owner's personal account**, linked to this repo only; `main` deploys to production. Never touch any other Vercel project. The owner does the Vercel login and the GitHub-app repo selection ("Only select repositories"); give him the exact clicks or command.
  - HTTPS (Vercel provides it) is required for WebGPU and service workers. If the model runtime uses threaded WASM or SharedArrayBuffer, set cross-origin isolation headers in `vercel.json` (COOP `same-origin`, COEP `require-corp` or `credentialless`) and check that the model/CDN hosts work with them.
  - Model weights: fetched on first load (e.g. from Hugging Face), then cached. Check Vercel's file-size limits before self-hosting weights. The first-load download goes under "What requires internet".
  - Put the live URL at the top of this file and of the README. The README also keeps run/recreate instructions: judges and verifiers may run it from the repo.
- [x] done · CI: GitHub Actions on every push to `main` (npm ci, typecheck, lint, build, test) · [lead] · owns: `.github/workflows/` · f9129fc (first green run on fa66af8)
- [x] done · Offline-ready signal: register the service worker via `virtual:pwa-register` and expose the app-shell status (unsupported / installing / ready / error) as a hook, with tests · [sr] · owns: `src/lib/pwa.ts`, `src/lib/appShell.ts`, `src/main.tsx` · b57722a
- [x] done · Storage-persistence request flow for a later model-download screen: ask for persistent storage, check free space against the download size (logic only, no UI), with tests · [sr] · owns: `src/lib/storage.ts` · aac81b7
- [x] done · Runtime-agnostic model cache: Cache API, keyed by model id + version, download progress callback, size integrity check, eviction of old versions, with mocked tests · [sr] · owns: `src/lib/modelCache.ts` · d27441c
- [x] done · Device-check page shows the inference backend the app would pick and why: WebGPU only where safe, WASM single-threaded on iPhone/iOS Safari, WASM threads only when cross-origin isolated (pure, unit-tested function) · [sr] · owns: `src/lib/backend.ts`, `src/App.tsx` (placeholder) · f1502e8
- [x] done · Image downscale helper (long side ≤ 1280 px, OffscreenCanvas with a canvas fallback) for any vision input, unit-tested · [sr] · owns: `src/lib/image.ts` · 0e236b9
- [x] done · `docs/OFFLINE-SMOKE-TEST.md`: a section for when a runtime exists (its `.wasm` and the model file both load after a reload in airplane mode) · [sr] · owns: `docs/OFFLINE-SMOKE-TEST.md` · c2e47e6
- [x] done · `useModelDownload`: state machine for the designed model-loading states (idle → checking-storage → downloading {loaded, total, file} → verifying → ready, or error {code}), with cancel, retry, `holdReload()` while downloading and an already-cached fast path; logic only, unit-tested · [sr] · owns: `src/lib/useModelDownload.ts`, `src/lib/modelDownload.ts`, `src/lib/modelCache.ts` · 58dac97 (review fixes c03e4a6)
- [x] done · Inference worker scaffold, runtime-agnostic: module Worker, typed message protocol (init with the backend pick, run with progress, cancel, coded errors) and a fake echo runtime so it's testable now · [sr] · owns: `src/inference/` · 4ebaf08
- [x] done · Offline e2e test with Playwright, CI only (never on the laptop): `@playwright/test`, `test:e2e`, `playwright.config.ts`, `e2e/offline.spec.ts` (load, shell ready, go offline, reload, shell still renders) · [sr] · owns: `playwright.config.ts`, `e2e/`, `package.json`, the lockfile · c308f81 (not run yet: passes only once the Lead adds the CI job)
- [ ] todo · Theme from the `design/README.md` tokens, applied once; component library customized, no defaults · [sr] · owns: theme files
- [ ] todo · _task_ · [owner] · owns: `<files/folders>` · design: `design/<screen>`

**Platform notes for any on-device model (reported by outside sources, NOT yet verified on our devices; check on our own phones before relying on them):**
- **Offline precache:** the service worker's precache list (`vite.config.ts`, `workbox.globPatterns`) doesn't include `.wasm`/`.mjs`/model files, and Workbox skips files over 2 MiB by default. Add the runtime's files and raise `maximumFileSizeToCacheInBytes`, or runtime-cache model files (CacheFirst) with `navigator.storage.persist()`, or the model silently won't work offline. Acceptance for the runtime task: after a reload in airplane mode, the runtime's `.wasm` and the model file both load.
- **iPhone (iOS 26 Safari):** ONNX Runtime Web's WebGPU path is reported to run away on memory until iOS kills the tab, and ORT lists WebGPU on iOS Safari as unsupported. Default iPhones to the WASM backend, single-threaded; treat Transformers.js WebGPU on Safari as risky until our phone proves it. The device-check page should show which backend the app would pick.
- **Threads:** multithreaded WASM needs COOP `same-origin` + COEP `require-corp` (`docs/DEPLOY.md`), and every model host must then be CORP/CORS-compatible; otherwise ORT runs single-threaded.
- **iPhone memory:** tabs get killed without an error, and the memory available to a page may be small. Downscale images (≤1280 px on the long side) before inference and keep phone model budgets small.
- **Share target:** an iPhone PWA can't receive files from the share sheet (Android can). Any "share into the app" flow is Android-only, with a file picker everywhere.
- **Where model files live:** self-hosting them on our own domain is more reliable and can be precached, but `.gitignore` blocks weights and GitHub caps files at 100 MB. Decide per model when it's picked: self-host (force-add, listed in the README with source and license) or download from the model host on first load (listed under "What requires internet").

**Wow-flow acceptance (every wow-flow task):** works end to end in airplane mode after the first load (the test: load once, go offline, reload, use the core feature) · model weights cached (Cache API/OPFS, persistent storage) so the second load is instant · user data stays on the device (IndexedDB/SQLite/OPFS) · inference off the main thread · capability check with a designed fallback · any cloud feature is optional and shows a clear offline state.

## Next
- [ ] todo · Claude Design pass 2: remaining screens, 404, og:image, video title card · [lead] · owns: `design/`
- [ ] todo · _task_

## Submission (by 9:00 AM) & Demo Day
- [ ] todo · seed realistic Filipino demo data, stored on the device
- [ ] todo · error / empty / loading states on the wow flow (as designed)
- [ ] todo · mobile check on the live URL, on a real mid-range phone, **with Wi-Fi and data off** after the first load
- [ ] todo · feature-freeze audit against `QUALITY.md` (P0/P1 list) + PageSpeed/Lighthouse on the live URL, mobile · [lead]
- [ ] todo · `docs/ARCHITECTURE.md`: diagram, key decisions, the on-device AI pipeline (model, size, quantization, runtime, validation, fallback), what runs locally vs. what needs internet, limitations · [lead]
- [ ] todo · README, one section per item of the official checklist (`RULES.md`): project name + short description · problem and target user · live link + how to run/recreate · **What runs locally** · **What requires internet** · **Why does this product benefit from running AI locally?** · architecture · Responsible AI · disclosures (models used · technologies and frameworks · APIs and cloud services · existing code and assets · AI development tools) · open-source libraries · Lighthouse scores · team members, roles and contributions · [lead] · owns: `README.md`
- [ ] todo · ~1-minute demo video, wow moment in the first 10 s, showing it working with the network off (+ a longer backup for Demo Day) · [human]
- [ ] todo · final secret check of the whole git history (the repo is public) · [lead]
- [ ] todo · mock-verifier self-audit (read-only, as the organizers' AI agents would check us): ~4 PM after the first deploy, 4:00 AM at the freeze, ~8:30 AM before submitting; fix P0s first · [lead]
- [ ] todo · X/LinkedIn post **with the video attached** (its URL is the required "X / LinkedIn video URL"): #AppBuildersPH, tag Cognition and Devin · [human]
- [ ] todo · submit on the Cerebral Valley event page: project name, short description, team members, repo, demo video, X/LinkedIn video URL, what runs locally, what requires internet, the five disclosures, and the "Why local?" answer (copy from the README) · [human:Rovs]
- [ ] todo · Demo Day prep: model already downloaded on every demo device; airplane-mode run rehearsed; on-site by 12:00 PM for the 12:15 PM AV check · [human]
- [ ] todo · 5-minute pitch + Q&A drill, rehearsed ×3 (the questions will cover what runs locally and why) · [human]

## Ideas (not now — only after the wow flow is done)
-

## Done
-

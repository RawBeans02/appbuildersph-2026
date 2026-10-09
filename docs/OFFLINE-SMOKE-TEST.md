# Offline smoke test

Checks that the app shell keeps working with no network after one online visit. Run it on every new deploy that changes the service worker, the precache or the wow flow, and record each run at the bottom.

## On a laptop (Chrome or Edge, DevTools)
1. Open the live URL. In DevTools → **Application** → **Storage**, click **Clear site data**, then reload, so this is a true first visit.
2. **Application** → **Service workers**: the worker for the live URL shows as **activated and is running**. **Cache storage** has a `workbox-precache-…` cache that lists `index.html` and the `assets/` files.
3. **Network** → set throttling to **Offline**.
4. Reload. Expected: the page renders, and it shows **Network: Offline**. In the Network tab, the document and scripts come from **(ServiceWorker)**.
5. Still offline, open a path that doesn't exist (for example `/anything/here`). Expected: the same app shell renders, not the browser's offline error.
6. Set throttling back to **No throttling**. Expected: the page shows **Network: Online** without a reload.

## On a phone (no DevTools)
1. Open the live URL once with internet on and wait until the page has fully loaded.
2. Turn on airplane mode, with Wi-Fi **and** mobile data off.
3. Close the tab, then open the live URL again (or reload). Expected: the page renders and shows **Network: Offline**.
4. Turn airplane mode off. Expected: **Network: Online**.

## Once a model runtime exists
The runtime's `.wasm` / `.mjs` files and the model weights are not part of the app-shell check above. Each can fail offline on its own: Workbox's precache skips files over 2 MiB by default and doesn't list `.wasm` or `.mjs` unless told to, and the weights live in the Cache API or OPFS, not the precache. So check each one on its own.
1. With internet on, clear site data (laptop) and load the live URL. Download the model and wait until it shows as ready.
2. Laptop: in **Application** → **Cache storage**, find the runtime's `.wasm` (in the precache or a runtime cache) and the model files (for our model cache, a `model-cache:<id>@<version>` cache with one entry per file).
3. Go offline (DevTools **Offline**, or airplane mode with Wi-Fi and data off on a phone) and reload.
4. Run the core feature end to end. Expected:
   - the runtime's `.wasm` loads from **(ServiceWorker)** or the cache, with no failed request in red;
   - the model loads from the cache, with no download progress and no network error;
   - the Network tab shows no new requests while inference runs.
5. Write down the device, the browser and the backend the device check picked (WebGPU or WASM, and the thread count). On iPhone, also check the tab survives a few runs in a row: iOS can kill a tab that uses too much memory, with no error shown.

## The full wow flow
Load once and wait until the model shows as ready, go offline, reload, and run the wow flow end to end.

## Automated version
`E2E_BASE_URL=<url> npx playwright test e2e/offline.spec.ts` runs the laptop steps 1-5 against a deployed site in headless Chromium: first visit, wait for the shell to report ready, go offline, reload, open a deep link. Without `E2E_BASE_URL` it builds and serves the app locally (that's what CI runs on every push).

## Results
| Date and time (PH) | Commit | Device and OS | Browser and version | Result | Notes |
|---|---|---|---|---|---|
| Oct 9, 3:40 PM | `04ab7dd` (production at the time) | MacBook Air M2, macOS 26.6.2 | Playwright headless Chromium shell 156.0.8078.4 | Pass | Automated (`e2e/offline.spec.ts` against https://appbuildersph-2026.vercel.app): offline reload and an offline deep link both served by the service worker. curl checks: deep links return the shell, `/assets/missing.js` returns 404, `sw.js` is `max-age=0, must-revalidate`. The phone part is pending (owner, with the S2 OCR test). |

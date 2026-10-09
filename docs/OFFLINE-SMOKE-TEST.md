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

## When the AI lands
The wow flow adds to this test: load once and wait until the model shows as ready, go offline, reload, and run the core feature end to end. The model must load from the device's cache, and the Network tab must show no requests during inference.

## Results
| Date and time (PH) | Commit | Device and OS | Browser and version | Result | Notes |
|---|---|---|---|---|---|

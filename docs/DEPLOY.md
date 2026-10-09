# Deploy

The app is a static build (`dist/`) on **Vercel**. `main` deploys straight to production; there is no other environment.

## First-time setup (the owner, once)
1. Go to vercel.com and sign in to the owner's **personal** account.
2. **Add New** → **Project** → **Import** the `appbuildersph-2026` repository. If the Vercel GitHub app asks for access, choose **Only select repositories** and pick `appbuildersph-2026` only.
3. **Framework Preset:** Vite (the build command `npm run build` and the output directory `dist` follow from it). Leave environment variables empty.
4. **Deploy.** This creates a new project; no other Vercel project is touched.

After that, every push to `main` deploys to production.

## What `vercel.json` does
- **SPA fallback:** any path that isn't a file serves `index.html`, so deep links work online. Offline, the service worker serves the same `index.html`. Paths under `/assets/` are left out, so a missing script returns a real 404 instead of HTML.
- **Caching:** `sw.js` is always revalidated, so a new deploy reaches users on their next load. The hashed files in `/assets/` are cached for a year, since a new build gives them new names.

## Cross-origin isolation (off until a model runtime needs it)
Multithreaded WASM runtimes need `SharedArrayBuffer`, which needs the page to be cross-origin isolated. The placeholder page's device check shows whether it is. When a runtime needs it, add this entry to the `headers` array in `vercel.json` (JSON has no comments, so it lives here until then):

```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
    { "key": "Cross-Origin-Embedder-Policy", "value": "credentialless" }
  ]
}
```

Before turning it on:
- `credentialless` lets the page load cross-origin files (for example model weights from a CDN) without them sending a `Cross-Origin-Resource-Policy` header, as long as the request needs no cookies. Safari didn't support `credentialless` when this was written (check before relying on it); there, use `require-corp`, and every cross-origin file must then send `Cross-Origin-Resource-Policy: cross-origin` or be loaded with CORS. Check the model host's response headers.
- The service worker serves `index.html` from its cache, with the headers it had when it was cached. The new headers reach a returning user only after `index.html` changes and the precache refreshes it, which every build with code changes does.
- After deploying, check the device check on the live URL shows **Cross-origin isolated: Yes**, and rerun `docs/OFFLINE-SMOKE-TEST.md`.

## Fallback host: Cloudflare Pages (free)
Used only if Vercel can't deploy (e.g. its Hobby daily deployment limit). It serves the core offline app; the phase 2 backend (`api/`, Postgres, GPT-6 Luna) runs only on Vercel, so phase 2 stays off there (don't set `VITE_PHASE2`).
- Build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION=22`.
- `public/_headers` mirrors `vercel.json`'s caching headers. With no `404.html` in `dist`, Cloudflare Pages serves `index.html` for unknown paths (single-page app), so the app's own 404 still works.
- Every file is under Cloudflare's 25 MiB per-file limit (the largest is the ONNX Runtime WebAssembly file, about 14 MB).

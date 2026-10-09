# QUALITY — the build standard for this hackathon

Scoped from our team's build standard (Ultimate Build Source of Truth) to a 21-hour demo web app. Every agent checks its work against this list. Items under "Not applicable" are out of scope for this build; don't add them.

## Design: Claude Design is the only source of UI (MUST)
- Every screen and every state a user can see (default, loading, empty, error, success, the first screen, the 404) is designed and finalized in **Claude Design** before it is built. Exports, tokens and copy live in `design/`; `design/README.md` maps each screen to its task.
- Build to the design. Colors, fonts, type scale, spacing, radius, shadows and icons come only from the tokens in `design/README.md`, implemented once in a shared theme. Don't add a color, font, gradient, shadow, icon set or component that isn't in `design/`. Customize any component library to the tokens; never ship its default look.
- A screen or state isn't designed yet? Write `NEEDS DESIGN: <screen/state>` under the task in `TASKS.md`, build the logic behind it, and wait for the Lead's next Claude Design pass. Never improvise UI.
- Use the copy from the design (or its copy deck) word for word. Filipino context: pesos, real names and places, Taglish where natural.
- **"Vibe-coded" tells to avoid.** One alone can be fine; a stack of them is what makes an app look AI-generated:
  1. purple-to-blue gradients
  2. gradient hero text
  3. emojis in headings
  4. Inter everywhere
  5. colored-border cards
  6. glassmorphism cards
  7. low-contrast dark mode
  8. three icon boxes in a row
  9. a badge above the headline
  10. Lucide icons everywhere
  11. untouched shadcn defaults
  12. fade-in-on-scroll on everything
  13. cursor-following effects
  14. buttons that fade on hover
  15. inconsistent spacing
  16. em dashes everywhere in the copy
  17. buzzword copy
  18. serif italic accent text
  19. the trendy Space Grotesk + Instrument Serif pairing
  20. grain over a gradient

  Also: vague hero copy, grids of identical cards, weak hierarchy.

## UX (MUST)
- One primary action per screen. Secondary actions look secondary. Hide options that don't apply yet.
- Familiar patterns over novelty. On mobile: bottom nav with at most 5 tabs, Home on the left, Profile on the right, and the main create action in the middle if creating is core.
- Every async action has loading, success, empty and error behavior. Empty states teach the next step with one obvious action, demo data or a starter, instead of a dead end.
- If the core flow uses the camera, scanner or file picker repeatedly, keep it in context, with a fallback and handled permission denial, cancel and retry.
- AI suggestions are reviewable: the user confirms before anything is saved or sent.
- Phone-first: works at 375 px wide and on mobile data.

## Local AI: the challenge theme (MUST)
The challenge (`RULES.md`): an AI product that stays genuinely useful when the cloud disappears. Judges will check where the computation happens.
- **The core inference runs on the user's device** (browser via WebGPU/WASM, phone or laptop). Cloud features are optional, disclosed in the UI, and never needed for the wow flow.
- **Fully offline after the first load:** the wow flow works in airplane mode, start to finish.
  - The app shell is cached by a service worker (PWA).
  - Model weights are cached (Cache API or OPFS), so the second load is instant and works offline. Ask for persistent storage (`navigator.storage.persist()`) so the browser doesn't evict them.
  - User data is stored on the device (IndexedDB, SQLite or OPFS).
  - Any sync or cloud feature shows a clear offline state and never blocks the core flow.
- **Provable on stage:** a visible "running on this device" indicator, an offline indicator, and no network requests during inference (the Network tab stays empty).
- **Check device capability before loading a model** (WebGPU support, memory, storage quota), with a designed fallback: a smaller model, a WASM/CPU path, or a clear "this device can't run it" state. Never a blank screen or a frozen tab.
- **Model loading is a designed part of the wow flow:** download progress (MB and %), initialization or warm-up, ready, and failed with retry. Weights load after first paint and never block the page.
- **Size budget:** small quantized models that run on a mid-range phone or laptop. Record each model's name, parameter count, quantization, download size and license in `docs/ARCHITECTURE.md` and the README. Pre-download the model on every demo device before the pitch.
- **Inference runs off the main thread** (Web Worker), so the UI stays responsive while the model works.
- **No fake speed numbers:** any tokens/s or latency shown in the UI, README or pitch is measured live or on a named device.

## Web quality (MUST)
- Accessible basics: semantic HTML, one `h1` per page, labels on inputs, alt text, visible focus states, WCAG AA contrast, a keyboard path through the main flow, a skip-to-content link.
- A real (designed) 404 page, a page title and meta description, and an `og:image` for link previews.
- Production build (minified, route-split); compressed images, lazy-loaded below the fold; no blocking third-party scripts.
- Confirmation dialogs only for destructive actions. Password inputs, if any, have a show/hide toggle.
- Lighthouse (or pagespeed.web.dev) on the live URL, mobile, at feature freeze. Record Performance, Accessibility, Best Practices and SEO in the README; they are measured, so they are safe to show.

## Security, data and cost (MUST)
- Secrets only in `.env.local` and the hosting dashboard; never in code, logs or commits.
- Validate all input on the server (e.g. zod). Validate AI output against a schema before using it.
- Database: RLS on every table, and decide **which columns** a user may change, not just which rows. Quotas, credits, roles, prices and anything else that grants authority are server-only.
- Every query is bounded (`limit`, pagination); never load a whole table.
- Cloud AI and other paid APIs (only for optional cloud parts; the core inference is on-device) need:
  - a per-IP or per-user rate limit
  - max tokens
  - bounded retries (at most 2, with backoff)
  - timeouts
  - an env **kill switch** that falls back to a cached demo response

  A crowd may open the live URL at once, and a runaway loop must not drain credits. A human sets a spend cap in each provider's dashboard.
- Privacy: say in the UI what stays on the device and what (if anything) leaves it, and send any cloud service only the data it needs. Add a short "Privacy & AI" page: what is collected, where it is processed (on the device or which service), what the AI can get wrong.
- No login wall for the demo (or a working demo account).

## Engineering (MUST)
- One repo, one environment: `main` deploys straight to the live URL. Push small and often (`CLAUDE.md`).
- Before every push: typecheck + lint + the tests you touched. A failed hosting build keeps the last good deploy live, but fix or revert within minutes.
- Tests where they pay: unit tests for the core logic (parsing, money math, AI output handling) and one end-to-end test of the main flow (run in the cloud).
- Prefer established libraries and APIs over custom infrastructure. Check each license allows our use, and list it in the README.
- `docs/ARCHITECTURE.md`: a diagram, key decisions, the AI pipeline (model, prompt, validation, fallback) and its limitations. Every presenter must be able to explain it.
- Provenance: commit messages start with the author (`lead:`, `sr:`, `jr:`, `devin:`), and the AI co-author trailers stay. This backs the AI disclosure and "who built what".

## Feature-freeze audit (4:00 AM)
The Lead, or the Jr. Builder in the cloud, audits the repo and the live URL against this file **before changing any code**:
1. For each item, decide whether it applies.
2. Mark it VERIFIED (with evidence), PARTIAL, MISSING, RUNTIME CHECK or N/A (with a reason).
3. Output: P0 blockers, P1 findings, quick wins, runtime checks still needed, and the repair order.

Fix the P0 and P1 items by 6:30 AM, then re-check.

## Not applicable to this build (don't add them)
- App Store / Play submission, in-app purchases, subscriptions and paywalls
- A/B tests and pricing experiments, store localization / ASO
- Custom domain and email DNS, newsletter
- Cookie banner (unless we add trackers)
- Search Console, backlinks and sitemap SEO work
- Load balancers, push-notification prompts, home-screen widgets
- Account deletion (unless we add accounts)

If the challenge makes one of these core, the Lead moves it up.

## Optional experiment (only if Claude Design makes it intentional)
- A mascot with a defined personality for onboarding and empty states.

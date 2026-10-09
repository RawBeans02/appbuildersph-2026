# _Project name (TBD, from ONE-PAGER.md)_

_Short description (TBD): one sentence on who it helps and what it does without the cloud._

Built for the **AppBuildersPH Hackathon 2026** (Oct 9–10, 2026). Theme: **Local AI**. The challenge: "Build an AI product that remains genuinely useful when the cloud disappears."

| | |
|---|---|
| **Team name** | _TBD (exactly as on the official participant list)_ |
| **Live URL** | _TBD_ |
| **Repository** | https://github.com/RawBeans02/appbuildersph-2026 |
| **Demo video** | _TBD_ |
| **X / LinkedIn post (video)** | _TBD_ |

> This README is filled in as the build lands. Sections marked _TBD_ are not done yet.

## The problem
_TBD: the target user, the problem, and why it matters._

## Try it
- **Live URL:** _TBD_
- **Offline test:** open the live URL once and wait until the model shows as ready. Then turn on airplane mode, reload, and use it. _(Exact steps TBD.)_
- **Run or recreate it locally:** needs Node.js 20.19+ (or 22.12+) and npm.
  ```sh
  npm ci            # install the exact versions in package-lock.json
  npm run dev       # dev server (the service worker is off in dev)
  npm run build     # production build into dist/, including the service worker
  npm run preview   # serve dist/ locally to test the PWA and offline mode
  npm run typecheck && npm run lint && npm test
  npx playwright install chromium && npm run test:e2e   # offline e2e test (builds, serves, runs Chromium)
  ```
- Any demo data in the app is invented sample data and is labeled as such.

## What runs locally
| Part | Runs on | Model / runtime |
|---|---|---|
| App shell (HTML, JS, CSS), cached by a service worker | The user's browser | No model yet |
| _TBD: the on-device AI_ | | |

## What requires internet
| Part | Why it needs internet | What happens offline |
|---|---|---|
| First visit to the live URL | Downloads the app shell, which the service worker then caches | After the first visit, the app shell opens offline |
| _TBD_ | | |

## Why does this product benefit from running AI locally?
_TBD: the answer, true to the code._

## Architecture
_TBD: a summary here; the diagram, decisions, the on-device AI pipeline and its limitations will be in `docs/ARCHITECTURE.md`._

## Responsible AI
_TBD: what stays on the device, human review of AI output, limitations, how the AI can fail._

## Disclosures

### Models used
| Model | Parameters / quantization | Download size | Source | License |
|---|---|---|---|---|
| _TBD_ | | | | |

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

### AI development tools
Every AI session that touched this project:
- **Claude Code** (Anthropic, Opus 5.5): the **Lead** (planning, reviews, CI, docs and parts of the app) and the **Sr. Builder** (core implementation), each a Claude Code session, plus their subagents. Their commits start with `lead:` and `sr:`. The Claude co-author line on commits is the AI tool, not a person.
- **Review and verification subagents** (Claude Code): review only; they write no code.
- **The owner's separate Claude session ("Account Admin", an AI):** drafted the pre-event process docs on Oct 8, sets up and monitors the laptop (starts the agent sessions, watches memory), relays briefing details, and runs read-only audits; it writes no product code.
- **Claude** (chat, Research mode): research and idea selection.
- **Claude Design**: all UI design.
- **Devin**: _TBD (listed with its commits only if used)._

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

## Lighthouse (mobile, measured at feature freeze)
_TBD: Performance, Accessibility, Best Practices and SEO, measured on pagespeed.web.dev against the live URL._

## Team
| Name (as on appbuildersph.com/hackathon/participants) | GitHub | Role | Contributions |
|---|---|---|---|
| Rovince Eduvane | RawBeans02 | _TBD_ | _TBD_ |
| _TBD_ | | | |
| _TBD_ | | | |
| _TBD_ | | | |

Teammates commit under their own GitHub accounts; no one outside the team commits.

# Agapay design, pass 1 (Claude Design)

Handoff for Claude Code. Drop this folder into the repo as `design/`. Made with Claude Design during the event (Oct 9–10, 2026); list it in the repo README's "Designs" disclosure.

## About these files

The `.dc.html` files are **design references built in HTML**, not production code. Rebuild every screen in the app's own stack (Vite + React + TypeScript, `src/features/*`), with the tokens below in one shared theme. Don't copy the HTML or its inline styles into the app.

**Fidelity: high.** Colors, type, spacing, radii, copy and states are final. Match them exactly. Use no colors, fonts, icons or components that aren't in this folder; anything missing gets a `NEEDS DESIGN: <screen/state>` line in TASKS.md.

**To view:** serve this folder (`npx serve design`) and open any `.dc.html` file. Opening them straight from disk won't work, because they load sibling files (`support.js`, the four small component files). Each page is a pan-and-zoom canvas of 375 × 812 phone frames or 1280 × 800 laptop frames. Every frame has an ID badge (1a, 6b, L9c…) and a note under it with behavior details.

**Copy:** `COPY.md` has every string by screen. Use it word for word.

## Files

| File | Screens |
|---|---|
| `Agapay Design System.dc.html` | Tokens, contrast pairs, type scale, spacing, radius, elevation, focus and touch rules, icon list, components, app icon, manifest |
| `Agapay Local AI States.dc.html` | L1a–L1b first-run download, L2 not enough space, L3 keep files, L4 getting ready, L5 ready sheet, L6a–L6b working, L7 offline sheet, L8a can't run, L8b count by hand, L9a–L9c errors, L10 Privacy & AI (brief screen 15) |
| `Agapay Phone 1 Home and Hinga.dc.html` | 1a–1d Home (default, loading, empty, error), 2a age, 3a–3d framing and camera permission, 4a counting, 5a–5d refusals, 6a–6c fast / URGENT / saved, 7a not fast |
| `Agapay Phone 2 Flood and Watch.dc.html` | 8a–8c log a flood, mark exposed, confirm · 9a–9c watch list, row sheet, empty |
| `Agapay Phone 3 Stock.dc.html` | 10a scan · 11a review (L11, the AI result review) · 12a–12b stock list, empty · 13a–13b exposure and stock, flagged |
| `Agapay Phone 4 Send and Privacy.dc.html` | 14a–14c what leaves, QR, shared · 404 |
| `Agapay Laptop.dc.html` | 16 home · 17a–17e scan and its results · 18 merged view · 19a–19d plan and AI panel states · 20 approval log |
| `StatusBar`, `BottomNav`, `LocalStatus`, `LaptopNav` `.dc.html` | Shared pieces the screens import. They map to app components (see below) |
| `support.js` | Preview runtime only. Not part of the app |
| `COPY.md` | Every string, by screen |
| `icons/` | App icon PNGs, ready for `public/icons/` |
| `assets/` | Mockup photos. Never ship them (see Assets) |

## Screen map

| Route | Screens |
|---|---|
| `/` | 1a default, 1b loading, 1c empty, 1d error |
| `/prepare` | L1a intro, L1b downloading, L2 not enough space, L3 keep files, L4 getting ready, L9a download stopped |
| `/hinga` | 2a age, 3a–3b framing, 3c camera pre-permission, 3d camera blocked, 4a counting, 5a–5d refusals, 6a fast, 6b URGENT, 6c saved, 7a not fast, L8a can't run, L8b count by hand, L9b didn't load |
| `/watch` | 8a log a flood, 8b mark exposed, 8c confirm, 9a watch list, 9b row sheet, 9c empty |
| `/stock` | 10a scan, L6a–L6b reading, 11a review, L9c couldn't read, 12a list, 12b empty |
| `/compare` | 13a exposure and stock, 13b flagged |
| `/send` | 14a what leaves, 14b QR, 14c shared |
| `/privacy` | L10 |
| `/municipal` | 16 home, 17a scanning, 17b success, 17c–17e other scan results |
| `/municipal/merged` | 18 merged view. **New route**: add it to `PLANNED_ROUTES` |
| `/municipal/plan` | 19a plan with AI draft, 19b–19d AI panel states |
| `/municipal/log` | 20 approval log |
| any other | 404 |

L5, L7, 8c and 9b are sheets over their screen, not routes. Loading and error states for Watch, Stock and Compare reuse Home's patterns (1b skeleton rows, 1d error block).

## Components to build once

- **StatusBar**: preview chrome only. Don't build it; the phone draws its own.
- **LocalStatus**: one quiet text line, icon + word, no pill and no border. `Runs on this phone` (laptop: `Runs on this laptop`) in --device with `device-mobile` / `laptop`, then `Offline` in --ink-2 with `cloud-slash`. 14/20 600, icons 16, 14 px gap. Shown only once the AI is ready. When online, only the device part shows. Tap opens L5 / L7. On camera screens: --device-on-night and --on-night-2.
- **BottomNav**: 78 px tall, --surface, 1 px --line top border, 5 equal columns: Home (`house`), Watch list (`users-three`), Hinga (`wind`), Stock (`package`), Send (`qr-code`). Labels 14 px. Active: ink, Fill icon, 700, a 32 × 4 ink bar at the top. Inactive: --ink-3, Bold icon, 600. Hinga is a raised 62 px ink circle (white `wind` 30 px), lifted 20 px with a 5 px --paper ring. Hidden inside the Hinga, scan and send flows.
- **LaptopNav**: 248 px sidebar, --surface, 1 px --line right border. Brand block (36 px ink "a" tile + "Agapay" / "Municipal view"), then items (48 px tall, radius 10): Scan QR codes (`scan`), Merged view (`table`), Plan (`list-numbers`), Approval log (`clock-counter-clockwise`). Active item gets a --sunken fill and 700. LocalStatus and a Privacy & AI link at the bottom.
- **Screen header (main phone screens)**: title 26/32 700, then a place line 16/24 --ink-2 (`San Isidro Demo · Sample data`), then LocalStatus 8 px below. 20 px side padding. Home adds a 48 px shield button (`shield-check`) on the right that opens Privacy & AI.
- **Flow top bar**: 56 px. A 48 px back or close button on the left, LocalStatus on the right. Step text under it, 15 px 700 --ink-2, with a small segmented step bar (28 × 6 segments).
- **Buttons**: 56 px tall, radius 12, 18/24 700, full width on phone.
  - Primary: ink fill, --surface text. A Tagalog suffix after a middle dot in --on-night-2, weight 600.
  - Secondary: --surface fill, 2 px ink border.
  - Text button: 48 px tall, underlined (offset 4 px).
  - On camera screens the primary is paper fill with ink text.
  - Disabled: --sunken fill with --ink-3 text (on dark: #3B362F with #A49D93).
  - Destructive solid red (--bad-fill) only inside a confirm sheet.
- **Fields**: label 16 px 700 above (never a placeholder label), input 56 px, 2 px --line-strong border, radius 12, 18 px text. Focus: ink border + 3 px ink outline, 3 px offset. Error: --bad border + message (15 px 600 --bad, `warning-circle` icon).
  - Box-reader "Please check": 2 px dashed --warn border, --warn-tint fill, an `eye` tag and a helper line in --warn.
  - "Sure": a `check` tag in --ok.
- **Checkbox and radio rows**: the whole row is the target (min 58–60 px). Box 28 px, radius 6, 2 px --line-strong. Checked: ink fill, white check, and the label goes 700.
- **Status pills** (only for one record's status in a list): 28 px, radius full, 14 px 700, 16 px icon. ok / warn / bad use their tint fill and text color; neutral uses --sunken / --ink-2. URGENT is the only solid pill (--bad-fill, white).
- **Bottom sheet**: --surface, top radius 24, shadow-2, a 40 × 5 grabber in --line, padding 12 / 20 / 24, scrim rgba(22,19,16,.5).
- **Toast**: ink, 12 radius, shadow-2, 16 px 600 text, optional underlined action. Sits above the nav, 16 px from the edges, for 6 s.
- **Progress**: 14 px track (--sunken with a 1 px --line inset), ink fill, radius full, always with a text label and MB / %. Indeterminate: a 30% segment that slides on a 1.4 s loop (it pulses under reduced motion).
- **Empty and error blocks**: a 64 px circle icon (--sunken; errors use --bad-tint with a --bad icon), title 22/28 800, body 17/25 --ink-2, one action.
- **Hinga result band**: radius 16, padding 16 / 18 / 18. A 17/22 800 label with icon, the 56 px metric + "breaths a minute" (20 px 700), then the cut-off line (16 px 600). Fast: --warn-fill with ink text. URGENT: --bad-fill with white text. Not fast: --ok-tint with ink text (the label in --ok).

## Behavior that matters

- **Hinga:** step 1 enables Next only when an age is picked and readiness is ticked. Framing enables Start only when the pose model finds the torso. Counting runs 60 s with a live trace and no running count. The quality gate can stop the count at any point (5a–5d), each with one Try again that goes back to framing.
  - Results: any danger-sign tick turns 6a into 6b immediately. Save writes a `HingaCheck` (outcome fast / urgent / not-fast). Cut-offs come from `imci.ts`.
  - The 7a re-check line cites WHO IMCI 2014 (follow up in 5 days if not improving).
  - 3c shows once, before the browser's camera and microphone prompt. 3d (blocked) and L8a (can't run) both offer L8b, counting by hand: tap per breath for 60 s, the same result screens, marked "Counted by hand".
- **First run:** L1a → L3 (one line, then `navigator.storage.persist()`) → L1b → L4 → Home. Check storage before downloading (L2). Cancel and failures (L9a) keep finished files. A model that fails to load twice leads to L8a.
- **Flood:** a tap marks a whole household (`markHouseholdExposed`). "Waded" is on for every mark; "Open wound" and "Repeated" are optional chips. Confirm (8c) states the exact window dates (days 5–15, `rules/watch.ts`). Watch-list order follows `watchList()`.
- **Stock:** the camera stays in the app. Review fields are all editable; "Please check" shows below the box reader's `CHECK_BELOW` threshold or when a field wasn't found. Quantity is always typed. Nothing saves without Confirm. Expiring = the expiry month starts within 6 weeks (`rules/stock.ts`).
- **Compare:** the reasons are the `reviewExposureStock()` strings, verbatim. One action, flag. Never a dose.
- **Send:** 14a lists all 14 schema counts already suppressed (`src/qr/`). The QR is pure black on white with a quiet zone; keep the screen awake while it shows. 14c is the BHW's own confirmation (the phone can't know it was scanned).
- **Laptop:** the webcam stays on between scans. The banner outcomes are success, already received, not valid, and newer replaces older. Merged totals add the age bands, so any total that includes "<5" cells is a range with an en dash (`formatRange`).
  - The plan comes from fixed rules and always works. The AI panel only drafts wording. Every number in the draft is checked against the plan: matches are tinted --ok-tint, and a mismatch turns the check line amber.
  - Approve saves the plan and the final text to the log. The approver is a role, never a name.

## Tokens

```css
:root {
  /* neutrals */
  --paper: #F7F4ED;        /* app background */
  --surface: #FFFDFA;      /* cards, sheets, fields, nav */
  --sunken: #EBE6DD;       /* insets, skeletons, info notes */
  --line: #D9D3CA;         /* dividers (decorative) */
  --line-strong: #7B7369;  /* field and checkbox borders, 4.6:1 on surface */
  --ink-3: #696259;        /* captions, placeholders, 5.5:1 on paper */
  --ink-2: #4D463F;        /* secondary text, 8.5:1 */
  --ink: #221D18;          /* text, primary buttons, 15.2:1 */
  /* camera screens */
  --night: #161310;
  --night-2: #2A2621;
  --on-night-2: #C7C3BD;   /* primary text on dark is --paper */
  /* status */
  --ok: #1D6835;       --ok-tint: #DFF6E2;     --ok-on-night: #83DC97;
  --warn: #805216;     --warn-tint: #FDEEC5;   --warn-fill: #F4C352;
  --bad: #AC2724;      --bad-tint: #FFE8E5;    --bad-fill: #B32322;   --bad-on-night: #FB988D;
  --info: var(--ink-2); --info-tint: var(--sunken);
  /* on this device: only the local-AI indicator and its sheet */
  --device: #0D6880;   --device-tint: #DFF2F9; --device-on-night: #91CFE5;
  /* disabled on dark */
  --disabled-night-bg: #3B362F; --disabled-night-fg: #A49D93;

  /* spacing (4 px base) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px;
  --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px; --space-16: 64px;
  /* radius */
  --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 24px; --r-full: 999px;
  /* elevation (2 levels) */
  --shadow-1: 0 1px 2px rgba(34,29,24,.08), 0 1px 1px rgba(34,29,24,.04);
  --shadow-2: 0 12px 32px rgba(34,29,24,.18), 0 2px 8px rgba(34,29,24,.10);
  /* scrim */
  --scrim: rgba(22,19,16,.5);
}
```

Contrast (WCAG 2.2). All text pairs pass AA:

| Pair | Ratio |
|---|---|
| ink / paper | 15.21 |
| ink-2 / paper | 8.45 |
| ink-3 / paper | 5.47 |
| ink-3 / sunken | 4.84 |
| surface / ink | 16.45 |
| ok / ok-tint | 5.97 |
| warn / warn-tint | 5.81 |
| ink / warn-fill | 10.16 |
| bad / bad-tint | 5.84 |
| surface / bad-fill | 6.50 |
| device / device-tint | 5.50 |
| device / paper | 5.78 |
| paper / night | 16.85 |
| on-night-2 / night-2 | 8.56 |
| device-on-night / night-2 | 8.77 |
| ok-on-night / night-2 | 9.05 |
| bad-on-night / night-2 | 7.14 |

## Type

| Token | Size / line | Weight | Use |
|---|---|---|---|
| metric | 56/56 | 800, tabular | the one big number on a result |
| display | 34/40 | 800, -0.01em | result headline, one per screen |
| title | 26/32 | 700 | screen title (h1) |
| heading | 20/26 | 700 | section heading (h2), sheet title |
| body-lg | 18/26 | 500 (700 bold) | default text, row titles; buttons 18/24 700 |
| body | 16/24 | 400 | descriptions, row meta (15/22 in dense rows) |
| caption | 14/20 | 600 | nav labels, pills, meta; smallest size in the app |
| mono | 16/22 | 500 | lot numbers, codes, MB, export numbers |
| mono-lg | 32–36/40 | 700 | Hinga countdown |

## Fonts

- **Atkinson Hyperlegible Next** (UI), Braille Institute of America, SIL Open Font License 1.1. Weights 400, 500, 600, 700, 800.
- **Atkinson Hyperlegible Mono** (codes and numbers), Braille Institute of America, SIL OFL 1.1. Weights 500, 700.
- Self-host the woff2 files in `public/fonts/` with the OFL text, so they work offline and are precached. List them in the repo README's assets section. The design files load them from Google Fonts for preview only.

## Icons

**Phosphor Icons 2.1** (MIT, phosphoricons.com): `@phosphor-icons/react`, added to the README's library list. Bold weight everywhere; Fill only for the active tab. Sizes: 16–18 in pills and inline status, 22–24 in rows and buttons, 26 in the nav, 28–40 in empty and error states. No other icon set.

Used: house, users-three, wind, package, qr-code, device-mobile, laptop, cloud-slash, wifi-slash, shield-check, warning, warning-circle, x-circle, check-circle, check, x, arrow-left, arrow-right, arrow-up-right, caret-right, caret-down, download-simple, hard-drives, memory, info, sun, drop, calendar-blank, clock, timer, arrow-clockwise, pencil-simple, scan, camera, camera-slash, microphone, speaker-high, vibrate, eye, eye-slash, arrows-split, flag, seal-check, lock-simple, plus, circle-notch, file-text, table, list-numbers, clock-counter-clockwise.

## App icon and manifest

A paper "a" (Atkinson Hyperlegible Next 800, #F7F4ED) on ink (#221D18) with one amber dot (#F4C352). Copy `icons/` to `public/icons/`: `icon-512.png`, `icon-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180), `favicon-32.png`.

Manifest values (the `manifest` block in `vite.config.ts`):

```json
{
  "name": "Agapay",
  "short_name": "Agapay",
  "description": "Offline health checks for barangay health workers after a typhoon.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#F7F4ED",
  "background_color": "#F7F4ED",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`index.html`:
- `<meta name="theme-color" content="#F7F4ED">`
- `<link rel="icon" href="/icons/favicon-32.png" sizes="32x32">`
- `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`
- Page titles: "Agapay", then "Screen · Agapay"; the 404 is "Page not found · Agapay".

## Rules that are easy to get wrong

- Ink is the action color. Green, amber, red and lagoon only ever mean a status.
- Every status is color + icon + word. Hinga results follow the IMCI chart: amber band = refer, red band = URGENT, green = not fast.
- Pills only mark one record's status inside a list (watch list, stock lots, received QRs). Everywhere else, a status is inline icon + text.
- LocalStatus is plain text with icons, never a pill. "Sample data" is plain text after the place name, never a badge.
- No uppercase letter-spaced labels, no eyebrow text above headings, no em dashes in copy. Ranges use an en dash (8–14).
- One primary button per screen, in the bottom third.
- Targets ≥ 48 px. The focus ring is 3 px ink with a 3 px offset (paper on dark screens). Hover is a solid color change, never a fade. Under reduced motion, no slides or fades.
- Cards sparingly: Home's flood watch, grouped checklists, laptop panels. Never in grids, never with a colored edge.
- "<5" means 1 to 4. Totals that include "<5" cells are ranges.
- Never a dose, never a diagnosis. Keep "Screening aid only. Not a diagnosis." and the DOH doxycycline note wherever they appear.

## Numbers and placeholders

- MB sizes: only the box reader's **26.9 MB** is measured (26,898,719 bytes, per the repo README). The breathing check (15.2 MB), crying check (13.0 MB), total (55.1 MB) and writing AI (879 MB) are placeholders. Show measured values from `offlineModels` / `modelBytes()`.
- "Read in 2.4 s" and "6.2 s" are measured live, never hard-coded.
- Free space (2.1 GB, 21.4 MB) comes from `navigator.storage.estimate()`.
- Dates and counts are sample data for Sat Oct 10, 2026 (the flood started Sun Oct 4; week 2026-W41), matching `src/data/seed/generate.ts`.

## Assets

- `icons/`: generated from the design system's icon tiles. Ship them.
- `assets/`: photos that stand in for the live camera in the mockups only. **Never ship them in the app**:
  - `hinga-camera-torso.jpg`
  - `stock-camera-box.jpg`
  - `stock-box-photo.jpg`
  - `stock-box-photo-blurry.jpg`
  - `laptop-webcam-qr.jpg`
  - `sample-qr.png` (an unsigned sample QR)

  If any photo was made with an image AI, name that tool in the repo README's AI disclosures.

## Added beyond the brief (from QUALITY.md)

- 3c camera and microphone pre-permission sheet; 3d camera blocked, with a fallback.
- L8b count by hand with a 60-second timer: the lighter mode for phones that can't run the camera AI.
- 7a keeps a danger-sign row: a danger sign means refer, whatever the count.
- 17e: a newer export replaces an older one.
- 19a checks every number in the AI draft against the plan.

## Task map (added by the Lead when landing pass 1)

Disclosure: the screens, tokens, copy, components and app icons in this folder were made with Claude Design during the event (Oct 9, 2026). The photos in `assets/` are placeholder images made with OpenAI gpt-image-2 for the mockups only; they are not product evidence and never ship in the app (see the repo README's AI disclosures).

| Task (TASKS.md) | Screens | Owner |
|---|---|---|
| A7 Theme + components, first | Design System: tokens, fonts (self-hosted woff2, OFL), Phosphor icons, LocalStatus, BottomNav, screen header, flow top bar, buttons, fields, checkbox/radio rows, pills, bottom sheet, toast, progress, empty/error blocks; app icons + manifest + `index.html` | [sr] |
| A8 Phone screens | 1a–1d Home · L1–L4, L9a Prepare · L5, L7 sheets · 8a–9c Watch · 10a, L6, 11a, L9c, 12a–12b Stock · 13a–13b Compare · 14a–14c Send · L10 Privacy · 404 | [sr] |
| B2-UI Hinga screens | 2a, 3a–3d, 4a, 5a–5d, 6a–6c, 7a, L8a, L8b count by hand, L9b | [lead] |
| B5-UI Laptop screens | LaptopNav · 16, 17a–17e, 18 (new route `/municipal/merged`), 19a–19d, 20 | [lead] |

Build order: A7's theme and shared components land first, in small pushes; the screen tasks use them and never restyle them locally.

## Pass 1 review decisions (Lead, Fri ~5 PM; these override the canvases)

From a three-reviewer design review (visual tells, UX/accessibility, copy) and the code audits. COPY.md already has the copy changes.
1. **Age bands** use the WHO IMCI wording: "Under 2 months", "2 up to 12 months", "12 months up to 5 years" (then "5 to 17 years", "18 to 59 years", "60 and over"). Exactly 12 months uses the 40 cut-off (`src/rules/imci.ts`).
2. **Fast breathing (6a) says "Refer today"** ("I-refer ngayong araw"); only URGENT (6b) says "now". That follows IMCI 2014 (fast breathing alone isn't an urgent referral; a danger sign is).
3. **Danger signs (6a/6b/7a)**: the four IMCI 2014 general danger signs (including "Vomits everything"), then chest indrawing and stridor in a calm child, then a separate "None of these" row. Save is enabled only after a tick or "None of these", and the list scrolls fully clear of the Save bar on an 812 px screen.
4. **Refusals 5a–5d**: after the second refusal in a row, add a secondary button "Count by hand with a timer" (L8b).
5. **Camera screens (3a/3b/4a, 10a)**: the top bar with LocalStatus sits on a solid --night bar (or a scrim of at least 0.8), never over the live image at 0.55.
6. **Home 1a**: the primary button keeps clear of the raised Hinga tab (no overlap); the raised tab stays.
7. **Laptop 19a**: also build the MISMATCH state: icon + outline on the number that doesn't match, an amber check line, and "Write it again". Never color only.
8. **Accessibility**: LocalStatus is a button at least 48 px tall (it opens L5/L7); 8b chips are 48 px with an 8 px gap; one h1 per screen (6a/6b/7a included); rows that would open an undesigned screen aren't tappable.

# AgapayMo design, pass 1 + pass 2 (Claude Design)

The product was renamed from Agapay to AgapayMo on Oct 9 (owner decision); the `.dc.html` canvases still show the old name, and COPY.md and this README use the new one.

Handoff for Claude Code. Drop this folder into the repo as `design/`. Made with Claude Design during the event (Oct 9–10, 2026); list it in the repo README's "Designs" disclosure.

## Pass 2: start here

Pass 2 adds life and purpose on top of pass 1. It is not a redesign: every pass 1 rule, token and component still holds. New frames carry IDs that continue pass 1's numbering and a P0 / P1 / P2 tag. Each animated frame has a “·m” companion showing start, end and the reduced-motion still, and a note with the keyframe, token, data source and still. Pass 2 sections sit at the top of each page, above pass 1.

### P0 build order (about 3 hours across three builders; if time runs short, cut from the bottom)

1. Motion foundation, CSS only: the tokens and keyframes below, the base.css delay fix, M1 `.spin`, M2 press states, M3 toast `rise`, M4 first paint, the 19c cursor `blink`, the I1 brand tile. See `AgapayMo Motion.dc.html`, M4 in `Agapay Local AI States.dc.html`, `BrandTile.dc.html`.
2. 11b: the box reader's line boxes on the photo (Phone 3).
3. Home: 1e story-led Home, 1f (AI not downloaded), 1g (instructions row and sheet), the date fix, the “Got a QR from the RHU? Scan it” link (Phone 1).
4. Intro 0a–0c and L10b (`AgapayMo Phone 0 Intro.dc.html`, Phone 4). Until I3 ships, 0a shows the I1 tile at 96 px.
5. Laptop core: LaptopNav v2, the LoopStrip, 16b, 17g, 17h, 19g (Laptop).
6. 21a: minimum restyle of Receive RHU instructions, the demo's last beat (Phone 4).
7. Laptop rest: 18c (with the B22 pill variant), 19f, 19h.
8. I2: the loop drawing on 0c (`LoopDrawing.dc.html`). Until it ships, 0c shows its labels as an ordered list joined by `arrow-right` icons.

### Settled

- **Name:** “AgapayMo” in all copy, page titles (`{Screen} · AgapayMo`), LaptopNav and the 404. Every pass 1 string is renamed in the frames and COPY.md. Design file names stay as they are.
- **Age bands:** `Under 2 months`, `2 to 11 months`, `1 to 4 years` everywhere (see Age bands below).
- **--device** keeps its pass 1 scope: only the local-AI indicator and its sheet. AI output drawn on screen (box-reader boxes, the breathing trace) is paper and ink.
- **Lead corrections (Oct 10):**
  - 19c P1: the number underlines are ink (they may play `draw`); the check line stays `info` “No new numbers found; check each number against the plan steps”. No --ok, no green tint, never “All numbers match”.
  - 4b: the trace panel's midline is 1 px --disabled-night-bg. No raw hex, no new colors.
  - LocalStatus v2 is dropped. LocalStatus stays as in pass 1, shown only once the AI is ready; 1f's AI row covers a phone without the AI.
- **No mascot.** The live URL is written `{live URL}` until hosting is up. Hinga in the live demo is the Lead's call; nothing in the intro, Home or the laptop depends on it.
- **Numbers** are computed from records on the device; samples are in braces in COPY.md. The sample timeline: four barangays in by 9:20 AM, Maligaya-D lands at 10:48 AM, approval at 10:52 AM, the phone receives at 11:05 AM.

### New files

| File | What |
|---|---|
| `AgapayMo Phone 0 Intro.dc.html` | 0a (I1 fallback), 0a·I3, 0b, 0c (AI ready), 0c·2 (AI not downloaded), with motion |
| `AgapayMo Motion.dc.html` | Tokens, every keyframe live next to its still, M1–M4, press states, where-used table, rules, I1–I3 specimens |
| `BrandTile.dc.html` | I1. Build as one `BrandTile` component with a `size` prop (28 / 32 / 36 / 40 / 96) |
| `LoopDrawing.dc.html` | I2 compact with its HTML labels. Props: `lit` (`all` / `phone`), `state` (`drawn` / `start`) |
| `LoopStrip.dc.html` | The laptop LoopStrip. Props: `current` (1–5), `received` (0–5), `approved`, `approvedAt`, `planSteps`, `motion` (design-only) |
| `svg/` | `brand-tile.svg` (P0), `loop-compact.svg` (P0), `loop-wide.svg` (P1), `intro-barangay.svg` (P1) |

Pass 2 frames on existing pages: Phone 1 (1e, 1f, 1g, 1g·sheet, 1e·rows), Phone 3 (11b, 11b·2 “Please check”, 11b·3 field focus), Phone 4 (21a, 21a·2, 21a·3, L10b), Local AI States (M4), Laptop (Nav v2, LoopStrip states, 16b at 4 and 5 of 5, 17g, 17h, 18c, 19c·d, 19f, 19g, 19h).

### Motion: tokens, the base.css fix, keyframes (paste as is)

```css
/* tokens.css */
:root {
  --dur-press: 90ms;    /* a button, row or chip is pressed */
  --dur-quick: 160ms;   /* a check drawn, a number changing, an icon stamp */
  --dur-base: 200ms;    /* something arrives: sheet, toast, panel, card */
  --dur-slow: 400ms;    /* data lands: a meter segment fills, a row lands */
  --dur-draw: 600ms;    /* a drawing completes; the longest anything runs */
  --dur-loop: 1400ms;   /* real work running: spinner, indeterminate bar, cursor */
  --stagger: 40ms;      /* between items drawn from one real result; total capped at --dur-draw */
  --rise: 8px;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) { :root { --stagger: 0ms; } }

/* base.css: today the reduce block zeroes durations but not delays */
@media (prefers-reduced-motion: reduce) {
  *:not(.motion-safe), *:not(.motion-safe)::before, *:not(.motion-safe)::after {
    animation-delay: 0s !important;
    transition-delay: 0s !important;
  }
}

/* keyframes: "from" only, so the resting CSS is always the final state */
@keyframes rise       { from { transform: translateY(var(--rise)); opacity: 0; } }
@keyframes land       { from { transform: translateY(calc(var(--rise) * -1)); opacity: 0; } }
@keyframes tick-out   { to   { transform: translateY(-100%); } }
@keyframes tick-in    { from { transform: translateY(100%); } }
@keyframes fill       { from { transform: scaleX(0); } }
@keyframes draw       { from { stroke-dashoffset: 1; } }            /* paths carry pathLength="1" */
@keyframes wipe       { from { clip-path: inset(0 100% 0 0); } }    /* "draw" on a Phosphor icon */
@keyframes reveal-qr  { from { clip-path: inset(0 0 100% 0); } }
@keyframes reveal-box { from { opacity: 0; transform: scale(0.96); } }
@keyframes stamp      { from { transform: scale(1.08); opacity: 0; } }
@keyframes spin       { to   { transform: rotate(360deg); } }
@keyframes blink      { 0%, 49.99% { opacity: 1; } 50%, 100% { opacity: 0; } }
@keyframes show       { from { visibility: hidden; } to { visibility: visible; } }

/* set data-just when the real event fires; remove it on animationend */
[data-just="rise"]       { animation: rise var(--dur-base) var(--ease-out) backwards; }
[data-just="land"]       { animation: land var(--dur-base) var(--ease-out) backwards; }
[data-just="fill"]       { transform-origin: left; animation: fill var(--dur-slow) var(--ease-out) backwards; }
[data-just="draw"]       { stroke-dasharray: 1; animation: draw var(--dur-quick) var(--ease-out) backwards; }
[data-just="draw-line"]  { stroke-dasharray: 1; animation: draw var(--dur-draw) var(--ease-in-out) backwards; }
[data-just="wipe"]       { animation: wipe var(--dur-quick) var(--ease-out) backwards; }
[data-just="reveal"]     { animation: reveal-qr var(--dur-draw) var(--ease-in-out) backwards; }
[data-just="reveal-box"] { animation: reveal-box var(--dur-base) var(--ease-out) backwards;
                           animation-delay: calc(var(--i) * var(--stagger)); }
[data-just="stamp"]      { animation: stamp var(--dur-base) var(--ease-out) backwards; }
.tick { display: inline-grid; overflow: clip; }
.tick > * { grid-area: 1 / 1; }
.tick > [data-old] { animation: tick-out var(--dur-quick) var(--ease-out) forwards; }
.tick > [data-new] { animation: tick-in var(--dur-quick) var(--ease-out) backwards; }
.spin { animation: spin var(--dur-loop) linear infinite; }                 /* M1 */
.cursor[data-streaming] { animation: blink var(--dur-loop) linear infinite; }
.first-paint { animation: show 0s 300ms both; }                            /* M4: add .motion-safe */

/* M2 press states */
.btn { transition: transform var(--dur-press) var(--ease-out); }
.btn:active { transform: scale(0.98); }
.btn-primary:active { background: var(--night); }
.on-night .btn-primary:active { background: var(--on-night-2); }
.btn-secondary:active, .row:active, .chip:active, .tab:active { background: var(--sunken); }
@media (prefers-reduced-motion: reduce) { .btn:active { transform: none; } }
```

### Motion rules (A4)

1. Only real events move: a tap that landed, data that arrived, work that is running, a drawing made from real output. Nothing on load, scroll or hover (hover stays a solid color change). Nothing loops unless real work runs. Rows never enter one after another.
2. Only transform, opacity, clip-path and stroke-dashoffset. Meters use scaleX, never width.
3. The resting CSS is the final state; keyframes only play the way in. Trigger with `data-just`, remove on animationend. No JS animation loops, no new requestAnimationFrame loops, no libraries. The Hinga canvas and the LLM stream stay the only JS-driven drawing.
4. Never delay input or results. No fake “Verifying…”. Stagger only real output sets (OCR boxes, the rule rail), within --dur-draw.
5. Never animate a clinical result: 6a, 6b, 7a appear at once, 6a turns into 6b instantly. Only 6c's saved check may stamp. During the 60 s count only the timer, the fill bar and the trace move; LocalStatus does not pulse.
6. Every motion that reports news has its words in a role="status" region (COPY.md lists them).
7. Nothing flashes more than 3 times a second (blink is 0.7 s on, 0.7 s off).
8. One moving region at a time; a screen's arrival finishes within --dur-draw. Exits are instant. Page changes stay hard cuts.
9. Banned: confetti, fake progress, invented waits, scanning-line sweeps, “AI thinking” when nothing runs, sound.
10. Haptics (P1): `navigator.vibrate(15)`, feature-detected, on save, confirm, start the watch, flag, receive. Never during Hinga framing or the count. Never the only signal.

| Keyframe | Means | Where | Reduced-motion still |
|---|---|---|---|
| rise | This just opened for you | Sheets, toast, intro cards, 17g and 19g panels, 19f steps | Appears in place |
| land | A record just arrived | 16b, 18c, 20c rows; 1g row; 9a new rows | No movement; tint and “Just now” stay |
| tick | This number changed because of you | P1: Home numbers, 8d count, meter labels | Swaps in place |
| fill | One more of a set is done | The segment just received, intro step bar, 18d bar just landed | Drawn filled |
| draw | Checked, or connected | 17g, 17h, 21a checks (together), 0c loop, LoopStrip connector, 19f rail, 19c underlines (P1) | Drawn |
| reveal | Made on this device just now | 11b boxes, 14e and 22a QRs | Shown at once |
| stamp | Saved, verified, approved | 19g seal, LoopStrip step 4, 11b tags, 21a success; P1: 6c, 13b, 14c, Prepare “Done” | Static icon |
| spin | Real work is running | Every circle-notch (M1) | Static icon plus the words |
| blink | The AI is still writing | The 19c cursor, only while tokens stream | Solid block |
| slide / pulse | Indeterminate progress | Progress | Pulse, as now |

### Component specs (pass 2)

- **LoopStrip** (laptop, every `/municipal` screen): a 64 px band under the h1 and sub line, the full width of the main column, --surface, 1 px --line bottom border. An `<ol>` of five steps, status only, never links. Each step: 22 px icon, label 14/20 600, status 14/20 --ink-2. Steps: `device-mobile` Reports in (“4 of 5” + a mini meter of 5 × 24 × 6 segments, 4 px gaps; received ink, waiting --sunken with a 1 px dashed --line-strong edge), `table` Merged, `list-numbers` Plan, `seal-check` Approved, `qr-code` Back to the barangay. Done: `check-circle` in --ok replaces the icon. Current screen: aria-current="step", label 700, a 32 × 4 ink bar on the band's bottom edge. Not reached: --ink-3. Connectors: 2 px --line-strong with an 8 px chevron; dashed while the next step isn't reached. Merged and Plan count as done once one report is in (the rules run instantly).
- **Home task row** (1e): rows with dividers on paper, never cards. Min 72 px, 16 px vertical padding. Left: 40 px circle (--sunken; status rows use their tint) with a 24 px icon. Middle: a task sentence in body-lg 700 with the number inside it (tabular figures), meta in body --ink-2. Right: 22 px `caret-right`. The whole row is the link and presses to --sunken. A row shows only when its records call for it, in this order: AI, Instructions, Watch, Expired, Expiring, Flag, Send. The breathing line under the rows is not a row (no divider, caret or press). All variants with singular and plural: `1e·rows` on Phone 1.
- **Check lines** (17g, 17h, 21a): a list in a --surface panel, one line per check in the order the device runs them, 22 px icon + 17/25 text. Passed: `check-circle` --ok. Failed: `x-circle` --bad, the line in 700, then the existing body copy with the next step. Info: `info` in ink. The list stops at the line that failed; never a check for a line that didn't run. Keys in mono 16/22 --ink-2 under their line. Results show the moment they exist; the icons draw together (clip-path wipe, --dur-quick); the panel rises. role="alert" for failures, role="status" otherwise.
- **11b overlay:** an aria-hidden, non-interactive SVG over a 335 × 240 view (radius 12, --night-2 behind). One rectangle per line the reader returned, in reading order: 2 px --surface outline, 1 px --ink outer halo, radius 2. “Please check” field: its box is a 2 px dashed --warn-fill outline, same halo. “Not read”: no box, no tag. Tags: 24 px ink circles with 14/700 paper mono numerals in the view's left margin, centered on their line (field order 1 Medicine, 2 Strength, 3 Lot, 4 Expiry; two fields from one line share a stacked tag). The same tag sits before each field's label. Focusing a field: its box gets a 4 px ink outline with a 2 px paper halo and its tag inverts (paper, ink numeral, 2 px ink edge); other boxes and tags dim to 50%. Boxes are never tap targets. Reveal in reading order (--stagger), then tags stamp, all within --dur-draw; fields are editable from the start.

### SVG art

- One ink line weight (2 px at 1x), round caps and joins. Fills only --paper, --surface, --sunken; the logo's amber for one dot. No gradients, filters, blur, raster, text or SMIL. Colors as `var(--token, #fallback)` so they follow the tokens inline and still render as files. aria-hidden, labels in HTML. A fixed height so nothing shifts. Any draw-in is a CSS class on pathLength="1" paths, so reduced motion applies. Paste into components, never into `public/`.
- The I1 “a” is the outline of Atkinson Hyperlegible Next 800 (SIL OFL 1.1), so the tile needs no font.

| File | Drawing size | Used on | P |
|---|---|---|---|
| `svg/brand-tile.svg` (I1) | 863 B | Home brand row 28, 0a 32, LaptopNav 36, M4 40, 0a fallback 96, og-image, video cards | P0 |
| `svg/loop-compact.svg` (I2, 335 × 56) | 1.4 KB | 0c (P0); Home report strip, L10b (P1) | P0 |
| `svg/loop-wide.svg` (I2, 1040 × 120) | 2.1 KB | og-image, end card, pitch slide | P1 |
| `svg/intro-barangay.svg` (I3, 335 × 160) | 1.5 KB | 0a, video title card | P1 |

The exported files also carry a content-credentials `<metadata>` block (about 7.8 KB). Paste only the drawing, or strip it with svgo, to stay under 4 KB.

### Flags (where pass 2 frames differ from the brief, or need the Lead)

1. **11b zoom.** The brief letterboxes the whole photo. On a real box photo the label lines are about 10 px tall at 335 px, with no room for 24 px tags (11b·m shows it). The view fits the lines' bounding box plus a margin into 335 × 240, never past 2×; a photo that is already all label shows whole.
2. **11b tag position.** A tag on the box's top-left corner covers the line's first letters and the line above, so tags sit in the view's left margin, centered on their line.
3. **draw on icons.** Phosphor Bold glyphs are filled shapes, so `draw` on a check icon is a clip-path wipe; stroke-dashoffset is for real SVG lines.
4. **M4 and reduced motion.** The new delay rule would zero M4's 300 ms wait; mark M4 `.motion-safe` (a visibility step, not motion).
5. **Sample receive time.** The brief's sample “Received Fri, Oct 9, 10:45 PM” comes before the 10:52 AM approval; the frames use Sat, Oct 10, 11:05 AM.
6. **Tinted rows.** On the 1g --ok-tint row the icon circle is --surface (--sunken reads muddy on green). On 16b·2 the Received pill on the tinted row takes the B22 edge, like the Priority pill.
7. **Text-button press** is not in the brief; we use --ink-2 and a 2 px underline plus the button scale.

### AI disclosure

SVG art drawn with Claude Design.

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
| `Agapay Phone 1 Home and Hinga.dc.html` | 1a–1d Home (default, loading, empty, error), 2a age, 3a–3d framing and camera permission, 4a counting, 5a–5e refusals, 6a–6c fast / URGENT / saved, 7a not fast |
| `Agapay Phone 2 Flood and Watch.dc.html` | 8a–8c log a flood, mark exposed, confirm · 9a–9c watch list, row sheet, empty |
| `Agapay Phone 3 Stock.dc.html` | 10a scan · 11a review (L11, the AI result review) · 12a–12b stock list, empty · 13a–13b exposure and stock, flagged |
| `Agapay Phone 4 Send and Privacy.dc.html` | 14a–14c what leaves, QR, shared · 404 |
| `Agapay Laptop.dc.html` | 16 home · 17a–17f scan and its results · 18–18b merged view · 19a–19e plan and AI panel states · 20–20b approval log |
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
| `/hinga` | 2a age, 3a–3b framing, 3c camera pre-permission, 3d camera blocked, 4a counting, 5a–5d refusals, 5e second refusal, 6a fast, 6b URGENT, 6c saved, 7a not fast, L8a can't run, L8b count by hand, L9b didn't load |
| `/watch` | 8a log a flood, 8b mark exposed, 8c confirm, 9a watch list, 9b row sheet, 9c empty |
| `/stock` | 10a scan, L6a–L6b reading, 11a review, L9c couldn't read, 12a list, 12b empty |
| `/compare` | 13a exposure and stock, 13b flagged |
| `/send` | 14a what leaves, 14b QR, 14c shared |
| `/privacy` | L10 |
| `/municipal` | 16 home, 17a scanning, 17b success, 17c–17f other scan results (17f camera blocked) |
| `/municipal/merged` | 18 merged view, 18b fewer than 5 received. **New route**: add it to `PLANNED_ROUTES` |
| `/municipal/plan` | 19a plan with AI draft, 19b–19e AI panel states (19e mismatch) |
| `/municipal/log` | 20 approval log, 20b empty |
| any other | 404 |

L5, L7, 8c and 9b are sheets over their screen, not routes. Loading and error states for Watch, Stock and Compare reuse Home's patterns (1b skeleton rows, 1d error block).

## Components to build once

- **StatusBar**: preview chrome only. Don't build it; the phone draws its own.
- **LocalStatus**: one quiet text line, icon + word, no pill and no border. Two buttons: `Runs on this phone` (laptop: `Runs on this laptop`) in --device with `device-mobile` / `laptop`, and `Offline` in --ink-2 with `cloud-slash`. 14/20 600, icons 16, 16 px apart, dotted underline (1 px, offset 4 px) because each opens a sheet (L5 / L7). Each has a 48 px tap area: the 20 px line plus 14 px of invisible padding above and below (negative margin, so the layout doesn't move). Shown only once the AI is ready. When online, only the device part shows. On camera screens: --device-on-night and --on-night-2.
- **BottomNav**: 78 px tall, --surface, 1 px --line top border, 5 equal flat tabs: Home (`house`), Watch list (`users-three`), Hinga (`wind`), Stock (`package`), Send (`qr-code`). Labels 14 px. Active: ink, Fill icon, 700, a 32 × 4 ink bar at the top. Inactive: --ink-3, Bold icon, 600. Nothing is raised: Home's Check breathing button is the big way into Hinga. Hidden inside the Hinga, scan and send flows.
- **Camera screens**: the status bar and top bar sit on a solid --night band (96 px; 132 px on the counting screen, which has the timer). Never put text or the indicator straight over the camera image.
- **LaptopNav**: 248 px sidebar, --surface, 1 px --line right border. Brand block (pass 2: the I1 brand tile at 36 px + "AgapayMo" / "Municipal view"), then items (48 px tall, radius 10): Scan QR codes (`scan`), Merged view (`table`), Plan (`list-numbers`), Approval log (`clock-counter-clockwise`). Active item gets a --sunken fill and 700. LocalStatus and a Privacy & AI link at the bottom.
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
- **Bottom sheet**: --surface, top radius 24, shadow-2, a 40 × 5 grabber in --line, padding 12 / 20 / 24, scrim rgba(22,19,16,.5). Dismissible sheets (L5, L7, 9b) also get a 48 px Close (`x`) top right. Sheet titles are h2 (h1 when the sheet is the whole screen, like 3c and 3d).
- **Toast**: ink, 12 radius, shadow-2, 16 px 600 text, optional underlined action. Sits above the nav, 16 px from the edges, for 6 s.
- **Progress**: 14 px track (--sunken with a 1 px --line inset), ink fill, radius full, always with a text label and MB / %. Indeterminate: a 30% segment that slides on a 1.4 s loop (it pulses under reduced motion).
- **Empty and error blocks**: a 64 px circle icon (always 64; icon 32–34) (--sunken; errors use --bad-tint with a --bad icon), title 22/28 800, body 17/25 --ink-2, one action.
- **Hinga result band**: radius 16, padding 16 / 18 / 18. A 17/22 800 label with icon, the 56 px metric + "breaths a minute" (20 px 700), then the cut-off line (16 px 600). Fast: --warn-fill with ink text. URGENT: --bad-fill with white text. Not fast: --ok-tint with ink text (the label in --ok). The headline under the band is the screen's h1.
- **Danger-sign checklist (6a, 6b)**: 6 signs, then `None of these` on a --paper row. Save stays disabled (--sunken fill, --ink-3 text, with a hint line above) until a sign or None of these is ticked. None and a sign can't both be ticked; any sign turns the screen into 6b.
- **Household rows (8b)**: only the checkbox row (48 px) marks or unmarks a household. Under a marked household, “Waded in floodwater” is static text; `Open wound` and `Repeated` are 48 px toggle chips, 8 px apart.

## Behavior that matters

- **Hinga:** step 1 enables Next only when an age is picked and readiness is ticked. Framing enables Start only when the pose model finds the torso. Counting runs 60 s with a live trace and no running count. The quality gate can stop the count at any point (5a–5d), each with one Try again that goes back to framing. After a second refusal in a row, the sheet adds Count by hand with a timer (5e).
  - Results: Save is gated by the danger-sign checklist (see Components); any sign turns 6a into 6b immediately. 6a's headline is “I-refer ngayong araw · Refer to the midwife or RHU today”; 6b's is “I-refer agad”. Save writes a `HingaCheck` (outcome fast / urgent / not-fast). Cut-offs come from `imci.ts`.
  - The 7a re-check line cites WHO IMCI 2014 (follow up in 5 days if not improving).
  - 3c shows once, before the browser's camera and microphone prompt. 3d (blocked) and L8a (can't run) both offer L8b, counting by hand: tap per breath for 60 s, the same result screens, marked "Counted by hand".
- **First run:** L1a → L3 (one line, then `navigator.storage.persist()`) → L1b → L4 → Home. Check storage before downloading (L2). Cancel and failures (L9a) keep finished files. A model that fails to load twice leads to L8a.
- **Flood:** a tap marks a whole household (`markHouseholdExposed`). "Waded" is on for every mark; "Open wound" and "Repeated" are optional chips. Confirm (8c) states the exact window dates (days 5–15, `rules/watch.ts`). Watch-list order follows `watchList()`.
- **Stock:** the camera stays in the app. Review fields are all editable; "Please check" shows below the box reader's `CHECK_BELOW` threshold or when a field wasn't found. Quantity is always typed. Nothing saves without Confirm. Expiring = the expiry month starts within 6 weeks (`rules/stock.ts`).
- **Compare:** the reasons are the `reviewExposureStock()` strings, verbatim. One action, flag. Never a dose.
- **Send:** 14a lists all 14 schema counts already suppressed (`src/qr/`). The QR is pure black on white with a quiet zone; keep the screen awake while it shows. 14c is the BHW's own confirmation (the phone can't know it was scanned).
- **Laptop:** the webcam stays on between scans. The banner outcomes are success, already received, not valid, and newer replaces older. Merged totals add the age bands, so any total that includes "<5" cells is a range with an en dash (`formatRange`).
  - The plan comes from fixed rules and always works. The AI panel only drafts wording. Every number in the draft is checked against the plan. A number the plan has gets a 2 px ink underline, never --ok or a tint (being in the plan doesn't prove it sits in the right place). With no new number the check line is `info` “No new numbers found; check each number against the plan steps” in --ink-2; it never says that all numbers match. A mismatch gets a dashed --warn outline and a warning icon, the check line turns amber and names it, and Approve is disabled until it matches or the draft is written again (19e).
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
| heading-lg | 22/28 | 800 | sheet titles, empty and error titles |
| heading | 20/26 | 700 | section heading (h2) |
| body-lg | 18/26 | 500 (700 bold) | default text, row titles; buttons 18/24 700 |
| body-md | 17/25 | 500 | helper lines, checklist rows, notes |
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
  "name": "AgapayMo",
  "short_name": "AgapayMo",
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
- Page titles: "AgapayMo", then "Screen · AgapayMo"; the 404 is "Page not found · AgapayMo".

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

## Age bands (from the pass 1 review)

The bands no longer overlap: `Under 2 months`, `2 to 11 months`, `1 to 4 years`, `5 to 17 years`, `18 to 59 years`, `60 and over` (completed months or years; a 12-month-old is “1 to 4 years”, cut-off 40, as in `imci.ts`). Rename the band labels in `src/data/seed/generate.ts` and anywhere else in the UI to match. The schema keys (`m2to12`, `y1to5`…) don't change.

## Not tappable in pass 1 (log as NEEDS DESIGN)

Build these as plain rows; their detail screens aren't designed yet:
- Home: the fast-breathing row (Hinga history)
- Stock list: lot rows (editing a lot)
- Merged view: barangay rows (age-band detail)
- Approval log: rows (full approved text)

## Changes after the pass 1 review (Oct 9)

- Ages: non-overlapping bands everywhere (above).
- Hinga results: added “Vomits everything” and “None of these”; Save gated on the checklist; headlines are h1; 6a reads “I-refer ngayong araw · Refer today”.
- Camera screens: solid --night top band behind the indicator and controls.
- Bottom nav: Hinga tab is flat (it overlapped Home's Check breathing button).
- Refusals: 5e adds the hand-count fallback after a second refusal.
- LocalStatus: two real buttons with 48 px tap areas and a dotted underline.
- 8b: checkbox-only toggle, 48 px chips 8 px apart, static “Waded”.
- Laptop: 19e mismatch state, 18b fewer than 5, 20b empty, 17f camera blocked, 19d field label, Priority pill 14/28, consistent sample times and log weeks.
- Copy: “No video or sound is saved”, L5 “Only counts leave, in the QR.”, 8c “Start the watch · Simulan”, 404 “Go to Home · Pumunta sa Home”, “(DOH guideline)”, design-system strings aligned with COPY.md.
- Tokens: added heading-lg 22/28 and body-md 17/25; 22 px gaps snapped to 24; all empty and error circles 64 px; no letter-spacing on the URGENT pill.

## Task map (added by the Lead when landing pass 1 / 1b)

Disclosure: the screens, tokens, copy, components and app icons in this folder were made with Claude Design during the event (Oct 9, 2026). The photos in `assets/` are placeholder images made with OpenAI gpt-image-2 for the mockups only; they are not product evidence and never ship in the app (see the repo README's AI disclosures).

| Task (TASKS.md) | Screens | Owner |
|---|---|---|
| A7 Theme + components, first | Design System: tokens, fonts (self-hosted woff2, OFL), Phosphor icons, LocalStatus, BottomNav, screen header, flow top bar, buttons, fields, checkbox/radio rows, pills, bottom sheet, toast, progress, empty/error blocks; app icons + manifest + `index.html` | [sr] |
| A8 Phone screens | 1a–1d Home · L1–L4, L9a Prepare · L5, L7 sheets · 8a–9c Watch · 10a, L6, 11a, L9c, 12a–12b Stock · 13a–13b Compare · 14a–14c Send · L10 Privacy · 404 | [sr] |
| B2-UI Hinga screens | 2a, 3a–3d, 4a, 5a–5d, 6a–6c, 7a, L8a, L8b count by hand, L9b | [lead] |
| B5-UI Laptop screens | LaptopNav · 16, 17a–17e, 18 (new route `/municipal/merged`), 19a–19d, 20 | [lead] |

Build order: A7's theme and shared components land first, in small pushes; the screen tasks use them and never restyle them locally.

## Lead notes: code-driven overrides (Fri ~6 PM)

Pass 1b (Claude Design's own revision with the review fixes) replaced pass 1; where it differs from what was built, the design wins. Two strings in COPY.md are set by the code instead, on purpose:
- **Send 14a / laptop 18:** "Exposed, watch not started yet, by age". The exposed age bands count only residents whose day-5–15 watch hasn't started, so they don't overlap "In the watch window now" (a privacy fix: otherwise a "<5" band could be worked out by subtraction).
- **Laptop 19a/19e:** the check line never claims "all numbers match". When the check finds nothing wrong it says "No new numbers found; check each number against the plan steps"; the model name comes from the code (Qwen2.5 0.5B).
- **Hinga 7a (not fast):** the danger-sign checklist is always shown and needs an answer (a sign, or "None of these") before Save, instead of sitting behind the "See a danger sign?" row. That's a safety choice: a child breathing normally can still have a danger sign that makes the visit URGENT, so the app never saves a check without asking.
- **Laptop 19a/19e:** numbers in an AI draft are not tinted green as "matched". The highlight only knows that a number appears in the plan, not that it's in the right place, so the screen never shows "verified" for what wasn't checked; mismatches are still marked.
- **Hinga L9b (the breathing check didn't load):** also offers "Count by hand with a timer" (secondary), like L8a and 5e, so a check is never stuck when the camera AI won't start on a phone (found by the WebKit CI run).
- **Pass 2, laptop 18d (Sat ~1:50 AM):** the "Doctor-team order" panel sits under the merged table and its "Why … first" line, not above the table. At 1280 × 800, above the table it pushed the table, which is the screen's main content and what the demo shows, below the fold.
- **Pass 2, phone toasts:** a toast closes on the next tap anywhere outside it, as pass 1 specifies ("for 6 s or until the next tap"). Otherwise the approval toast could sit over the laptop's return QR.
- **Hinga, after the Codex review (Sat ~5:30 AM):** under 2 months, a count of 60 or more is URGENT ("I-refer agad", "Fast breathing under 2 months (60 or more)."), not "Refer today", per the WHO 2014 booklet's young-infant section; its result shows "Bring the baby back right away if breathing gets fast or hard, the baby feeds poorly, has a fever or feels cold." instead of the 5-day line. Every failure or refusal screen and the hand count offer "Danger sign seen? Refer now", which opens the danger-sign checklist with no count; any sign ticked is URGENT and saves as "Not counted". Strings in `src/features/hinga/copy.ts`.

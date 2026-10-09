# TASKS — source of truth for who does what

Tags: `[lead]` `[sr]` (Sr. Builder, local) `[jr]` (Jr. Builder, cloud) `[devin]` (Devin, optional) `[human:<name>]`
Status: `todo` → `doing` → `done` (pushed to `main`, with the commit hash)
Under a task: `BLOCKED: <question>` · `NEEDS DESIGN: <screen/state>`
Every task names the files or folders it **owns**, so agents pushing straight to `main` don't collide.

**Live URL:** _(fill in after the first deploy)_  ·  **Scope check:** 12:00 AM  ·  **Feature freeze:** 4:00 AM  ·  **Submit by:** 9:00 AM (hard close 10:00 AM Sat, code freeze; no pushes after 9:45 AM)

**Designs:** all UI comes from Claude Design: `design/` (exports, tokens, copy + `design/README.md`). Link the screen on every UI task; no UI task starts before its screen exists.

**Model:** Opus 5.5 for every agent. **Effort:** Lead ultracode · Sr. max or ultracode · Jr. high or xhigh. If an agent hits a usage limit, the Lead reassigns its open tasks here.

## Now (the wow flow)
- [ ] todo · Claude Design pass 1: design system (tokens) + every wow-flow screen in all states (default, loading, empty, error) → `design/` + `design/README.md` · [lead] · owns: `design/`
- [ ] todo · Scaffold + first deploy of a "hello" page to the live URL (non-UI) · [sr] · owns: project config
- [ ] todo · Theme from the `design/README.md` tokens, applied once; component library customized, no defaults · [sr] · owns: theme files
- [ ] todo · _task_ · [owner] · owns: `<files/folders>` · design: `design/<screen>`

## Next
- [ ] todo · Claude Design pass 2: remaining screens, 404, og:image, video title card · [lead] · owns: `design/`
- [ ] todo · _task_

## Submission (by 9:00 AM) & Demo Day
- [ ] todo · seed realistic Filipino demo data
- [ ] todo · error / empty / loading states on the wow flow (as designed)
- [ ] todo · mobile check on the live URL
- [ ] todo · feature-freeze audit against `QUALITY.md` (P0/P1 list) + PageSpeed/Lighthouse on the live URL, mobile · [lead] or [jr]
- [ ] todo · `docs/ARCHITECTURE.md`: diagram, key decisions, AI pipeline, limitations · [lead]
- [ ] todo · README: problem, live link, how to run/recreate, architecture, Responsible AI, Built with (AI tools), open-source libraries, Lighthouse scores, team roles & contributions, note that only process templates predate the event · [lead]
- [ ] todo · ~1-minute demo video, wow moment in the first 10 s (+ a longer backup for Demo Day) · [human]
- [ ] todo · secret check of the whole git history · [lead] → make the repo public · [human:Rovs]
- [ ] todo · X/LinkedIn post: #AppBuildersPH, tag Cognition and Devin · [human]
- [ ] todo · submit on the Cerebral Valley event page (team, roles, contributions, AI tools) · [human:Rovs]
- [ ] todo · 5-minute pitch + Q&A drill, rehearsed ×3 · [human]

## Ideas (not now — only after the wow flow is done)
-

## Done
-

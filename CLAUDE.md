# Hackathon repo — rules for every agent (Lead, Sr. Builder)

Scope: working instructions for this team's own build agents during the build.

**Who builds:** the **Lead** and the **Sr. Builder**, both Claude Code sessions on the owner's 8 GB laptop, each in its **own clone** of this repo (so neither sees the other's work until it's pushed). Devin isn't used for this build. There is no cloud Jr. Builder for this build. Its work (tests, heavy checks, the audit) goes to the Lead and to the cloud checks below. Our human teammates push here too.

AppBuildersPH Hackathon 2026. **Submissions close 10:00 AM Sat Oct 10 (PH time), no extensions; the code freezes then. Feature freeze 4:00 AM; nobody pushes after 9:45 AM.** The idea is in `ONE-PAGER.md`, the official rules in `RULES.md`, the work in `TASKS.md`, the build standard in `QUALITY.md`. Read all four before doing anything.

## Hard rules
- **Official rules — a break disqualifies the team (details in `RULES.md`):** build everything from scratch now; never copy code from the team's other projects; open-source libraries are fine, and each one goes in the README's list. No help from anyone outside our 4 registered members. Every number shown in the UI, README, video or pitch is measured or cited — no made-up benchmarks or statistics. AI use is disclosed in the README.
- **This repo is public.** Anyone can read every commit, so never commit keys, personal data, or internal details of our other products. If a key ever lands in a commit, tell the owner at once so it can be rotated; deleting it later doesn't help.
- **Never read or modify the team's other products, their repos, accounts or deploys.** Work only in the hackathon folders and this repo.
- **Secrets:** keys go in `.env.local` (git-ignored) and the hosting dashboard, added by a human. Never commit, print, or paste a key; never put one in an issue, a PR, or TASKS.md.
- **Scope:** the one wow flow in `ONE-PAGER.md` comes first. Don't add features that aren't on `TASKS.md`; propose them in TASKS.md under "Ideas" instead.

## Play it straight: the organizers' AI agents verify every repo
They said so at the briefing: assume an AI reads every commit, every README claim and every network call.
- **Honest history:** commit small and often, with real timestamps. Never rewrite history, squash, amend pushed commits or force-push.
- **Fresh code, open models:** write all code fresh. Use only open-source libraries, and only open-source models for everything that runs on the device; add each to the README with its license, in the same commit that adds it. The one exception is the optional phase 2 cloud assistant (OpenAI GPT-6 Luna, server-side, owner's decision): a closed model that only ever sees de-identified aggregate counts, is never needed by the offline core, and is disclosed under "Models used", "APIs and cloud services" and "What requires internet".
- **Every number is measured:** any tokens/s, latency, accuracy, size or count in the UI, README, docs, video or pitch comes from a script or written method in this repo, with the device named. No estimates presented as results.
- **Keep the README true:** when a change alters what runs on the device or what needs internet, update the README's "What runs locally" and "What requires internet" in the same commit.
- **Disclose what predates the event:** our pre-written process docs (this file and the TASKS/ONE-PAGER/RULES/QUALITY templates, written Oct 8, no product code) are listed under "Existing code and assets" in the README. So is any font, icon, image or other asset we didn't make during the event.
- **Clean room:** never open, fetch or read the code of other camera breath-counter projects (e.g. Breathwise, the pediatric-rr repo). Their public descriptions are fine; their code isn't. Hinga is built only from published methods (pose torso region, band-pass + FFT/zero-crossing, the WHO IMCI 2014 cut-offs).
- **Nothing addressed to AI judges or verifiers:** no text anywhere in the repo that tries to steer a reviewer.
- **Commit authors:** only the Lead and the Sr. Builder (both use the repo-local identity set by the owner; prefixes `lead:` and `sr:`) and our registered teammates under their own accounts. No one else.

## How we ship: one repo, one environment, push right away
- One repo and one environment: `main` deploys straight to the live URL. No dev/staging/prod split, no long-lived branches.
- **Commit small and push straight to `main` as soon as a piece works.** Never sit on unpushed work for more than 30 minutes.
- **Before every push, always `git pull --rebase`** (other agents and our human teammates push to `main` too), then typecheck + lint + the tests you touched, then push. No force-push, no `--no-verify`.
- Commit messages start with who you are: `lead:`, `sr:`, or a human teammate's first name. Keep the AI co-author trailer. This is our record of who built what.
- **Stay in your lane:** each task in `TASKS.md` names the files or folders it owns. Don't edit another agent's files. Shared files (theme/tokens, layout, DB schema) are edited only by the owner named in `TASKS.md`.
- **If you break `main`** (build, deploy or the wow flow), fix it right away or `git revert` your commit. The live URL must always work.
- If your environment can't push to `main`, push a branch and open a PR; the Lead merges it right away.
- If a push is blocked (a denied prompt or a tool refusal), stop and give the owner the exact one-line command to run; don't work around it.
- After the 4:00 AM feature freeze: fixes only, for items on the Lead's audit list.

## Coordination (`TASKS.md` is the board; the Lead and Sr. Builder can also message each other)
- Claim a task in `TASKS.md` by putting your tag on it (`[sr]`, `[lead]`, `[human:<name>]`) and pushing that change first; mark it done with the commit hash.
- Blocked? Write `BLOCKED: <question>` under the task and push, and message the Lead (cross-session message) if it's urgent. The Lead checks TASKS.md at least every 30 minutes.
- Need a screen or state that isn't designed yet? Write `NEEDS DESIGN: <screen/state>` under the task, push, and keep building the logic.

## Design: Claude Design only
- All UI comes from the Lead's **Claude Design** exports in `design/`: screens, tokens, copy and assets, with `design/README.md` mapping screens to tasks. Build to them exactly: no colors, fonts, gradients, icons or components that aren't in `design/`, and no improvised screens. The full rules and the "vibe-coded" tells to avoid are in `QUALITY.md`.
- The Lead compares each built screen on the live URL with its design and sends differences back through `TASKS.md`.

## Local machine limits (Lead and Sr. Builder only — the laptop has 8 GB RAM)
- Run heavy commands through the guard, which lives outside the repo: `~/Documents/Hackathons/AppBuildersPH-2026/tools/lowmem-run.sh <cmd>` (npm/pnpm install, production builds, e2e/browser tests, anything that may use >1 GB). It allows one heavy job per machine and stops jobs that push memory past 6.7 GB.
- Light commands (typecheck, lint, a single unit test file) can run directly.
- **Both agents share this one laptop**, and the guard runs one heavy job at a time across both, so expect queueing. The Sr. Builder takes the heavy local steps; the Lead keeps to light checks where it can. Don't keep a dev server running when you're not using it.
- **Heavy checks run in the cloud wherever possible:** the hosting build on every push to `main`, and GitHub Actions CI (typecheck, lint, tests, production build, e2e). Read their results instead of re-running them locally.
- **Running a local AI model on this laptop** (a WebGPU browser tab, Ollama, MLX) is the heaviest job of all; it can take a large share of the laptop's memory. Message **Account Admin** (the owner's separate Claude session that watches laptop memory; an AI that writes no code) first so it can check memory. Use the smallest quantized model that proves the point, one at a time, and close the tab or process right after. Real model checks are better done on our phones and other laptops via the live URL.
- No Docker unless the Lead approves it. Use hosted services for infrastructure (hosting, CI). The AI itself runs on the user's device (`QUALITY.md`).
- Under ultracode, subagents may write code (in files their task owns), but heavy commands (installs, builds, e2e, model tests) still go through the guard one at a time across both agents.

## Effort and usage limits
- Every agent runs **Opus 5.5**; only the effort differs, set by the owner at session start: **Lead = ultracode** · **Sr. Builder = ultracode**. Use it for quality, and under ultracode for parallelism where it helps.
- Higher effort burns quota faster, and hitting a 5-hour limit pauses an agent for hours. Push small and often so another agent can pick up your task from `main` if you're paused.
- If any agent hits a limit, the Lead reassigns its open `TASKS.md` items (the owner does it if the Lead is paused).

## Definition of done
Matches the design (UI) · typecheck/lint clean · tested (unit test or a run on the live URL) · meets the relevant `QUALITY.md` items · pushed to `main` · the live URL still works · marked done in `TASKS.md` with the commit hash.

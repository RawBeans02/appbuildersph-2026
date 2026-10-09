# Hackathon repo — rules for every agent (Lead, Sr. Builder, Jr. Builder, Devin)

AppBuildersPH Hackathon 2026. **Submissions close 10:00 AM Sat Oct 10 (PH time), no extensions; the code freezes then. Feature freeze 4:00 AM; nobody pushes after 9:45 AM.** The idea is in `ONE-PAGER.md`, the official rules in `RULES.md`, the work in `TASKS.md`, the build standard in `QUALITY.md`. Read all four before doing anything.

## Hard rules
- **Official rules — a break disqualifies the team (details in `RULES.md`):** build everything from scratch now; never copy code from our other projects (KitaMo, KayaMo, CarinderAI or any other); open-source libraries are fine, and each one goes in the README's list. No help from anyone outside our 4 registered members. Every number shown in the UI, README, video or pitch is measured or cited — no made-up benchmarks or statistics. AI use is disclosed in the README.
- **This repo is public.** Anyone can read every commit, so never commit keys, personal data, or internal details of our other products. If a key ever lands in a commit, tell the owner at once so it can be rotated; deleting it later doesn't help.
- **Never touch KitaMo.** No reads or writes in `~/Documents/KitaMo-ph`, nothing in the `kitamo-ph` GitHub org, its Supabase/Vercel projects, secrets or deploys. It is a live product with a real customer.
- **Secrets:** keys go in `.env.local` (git-ignored) and the hosting dashboard, added by a human. Never commit, print, or paste a key; never put one in an issue, a PR, or TASKS.md.
- **Scope:** the one wow flow in `ONE-PAGER.md` comes first. Don't add features that aren't on `TASKS.md`; propose them in TASKS.md under "Ideas" instead.

## How we ship: one repo, one environment, push right away
- One repo and one environment: `main` deploys straight to the live URL. No dev/staging/prod split, no long-lived branches.
- **Commit small and push straight to `main` as soon as a piece works.** Never sit on unpushed work for more than 30 minutes.
- Before every push: `git pull --rebase`, then typecheck + lint + the tests you touched, then push. No force-push, no `--no-verify`.
- Commit messages start with who you are: `lead:`, `sr:`, `jr:`, `devin:`. Keep the AI co-author trailer. This is our record of who built what.
- **Stay in your lane:** each task in `TASKS.md` names the files or folders it owns. Don't edit another agent's files. Shared files (theme/tokens, layout, DB schema) are edited only by the owner named in `TASKS.md`. Devin's folders are off-limits to the Claude agents.
- **If you break `main`** (build, deploy or the wow flow), fix it right away or `git revert` your commit. The live URL must always work.
- If your environment can't push to `main` (some cloud or Devin setups only push branches), push a branch and open a PR; the Lead merges it right away.
- If a push is blocked (a denied prompt or a tool refusal), stop and give the owner the exact one-line command to run; don't work around it.
- After the 4:00 AM feature freeze: fixes only, for items on the Lead's audit list.

## Coordination (the repo is the channel — the cloud agent can't message local agents)
- Claim a task in `TASKS.md` by putting your tag on it (`[sr]`, `[jr]`, `[lead]`, `[devin]`) and pushing that change first; mark it done with the commit hash.
- Blocked? Write `BLOCKED: <question>` under the task and push. The Lead checks TASKS.md at least every 30 minutes.
- Need a screen or state that isn't designed yet? Write `NEEDS DESIGN: <screen/state>` under the task, push, and keep building the logic.

## Design: Claude Design only
- All UI comes from the Lead's **Claude Design** exports in `design/`: screens, tokens, copy and assets, with `design/README.md` mapping screens to tasks. Build to them exactly: no colors, fonts, gradients, icons or components that aren't in `design/`, and no improvised screens. The full rules and the "vibe-coded" tells to avoid are in `QUALITY.md`.
- The Lead compares each built screen on the live URL with its design and sends differences back through `TASKS.md`.

## Local machine limits (Lead and Sr. Builder only — the laptop has 8 GB RAM)
- Run heavy commands through the guard, which lives outside the repo: `~/Documents/Hackathons/AppBuildersPH-2026/tools/lowmem-run.sh <cmd>` (npm/pnpm install, production builds, e2e/browser tests, anything that may use >1 GB). It allows one heavy job per machine and stops jobs that push memory past 6.7 GB.
- Light commands (typecheck, lint, a single unit test file) can run directly.
- No Docker unless the Lead approves it. Prefer hosted services.
- Anything heavy that can run in the cloud belongs to the Jr. Builder.
- Under ultracode, parallel subagents count too: heavy commands still go through the guard one at a time.

## Effort and usage limits
- Every agent runs **Opus 5.5**; only the effort differs, set by the owner at session start: **Lead = ultracode** · **Sr. Builder = max, or ultracode** · **Jr. Builder = high or xhigh**. Use it for quality, and under ultracode for parallelism where it helps.
- Higher effort burns quota faster, and hitting a 5-hour limit pauses an agent for hours. Push small and often so another agent can pick up your task from `main` if you're paused.
- If any agent hits a limit, the Lead reassigns its open `TASKS.md` items (the owner does it if the Lead is paused).

## Definition of done
Matches the design (UI) · typecheck/lint clean · tested (unit test or a run on the live URL) · meets the relevant `QUALITY.md` items · pushed to `main` · the live URL still works · marked done in `TASKS.md` with the commit hash.

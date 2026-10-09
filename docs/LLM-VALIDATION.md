# Local wording: validation and release gate

The municipal plan is computed by fixed rules. Qwen2.5 0.5B supplies an
optional short action summary, never an approval, diagnosis, dose or inventory
change. The complete plan remains available when the model is unavailable,
times out, or produces rejected wording. Every accepted draft still needs
human review: the validator checks words and positions, not all meanings.

## Implementation

- WebLLM is pinned to 0.2.85. The worker and readiness check share the exact
  f16/f32 model records; a unit test compares them with the installed library.
- Readiness requires the selected variant's configuration, declared tokenizer,
  GPU WASM library, tensor index, every listed shard, and the current built
  wording worker. A partial download or the other variant is insufficient.
- Offline initialization checks the complete set before creating a worker.
  Missing files show a reconnect message while the fixed plan stays available.
- Storage persistence is requested best-effort after opting into the model.
  Successful initialization triggers a fresh cache check and badge update.
  A persistence grant is not proof of readiness; browsers may evict files.
- The prompt sends ordered priority names/scores and transfer source,
  recipient and capped amount. Generation has a bounded, action-based token
  budget. The existing rejection checks and fixed safety reminder remain.
- Cancellation and the existing 90-second timeout release the worker and
  prevent late progress from restoring the loading state.

## Reproduce

Build the production app and use a hardware-WebGPU laptop. Generic CI and
software GPU emulation do not establish actual model readiness or speed.
The following are PowerShell commands; use `npm`/`npx` on other platforms.

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test -- --maxWorkers=2
npx.cmd tsc -p tsconfig.e2e.json --noEmit
npm.cmd run test:e2e -- --project=chromium

$env:RUN_REAL_LLM='1'
npm.cmd run test:e2e -- --project=chromium e2e/llm-offline.spec.ts
# Add this for all four generated drafts to require guard acceptance:
$env:REQUIRE_REAL_LLM_WORDING='1'
npm.cmd run test:e2e -- --project=chromium e2e/llm-offline.spec.ts

$env:RUN_REAL_LLM_QUALITY='1'
npm.cmd run test:e2e -- --project=chromium e2e/llm-quality.spec.ts
```

The offline spec records worker/page errors, requests, cache URLs and outcomes
after one online preparation and three complete offline reloads. The default
cache regression permits a visibly rejected draft; the additional acceptance
flag requires all four drafts to pass. Diagnostics are attached even on failure.

The quality spec uses ten fixed synthetic plans and the actual production
worker protocol with networking disabled. It records output, generation time
and the production guard result for every completed case, including partial
results before an error. The automated threshold is at least eight accepted
drafts. Manually review each accepted output for changed meaning or new actions.
Zero unsafe accepted drafts and three consecutive usable drafts of the complete
demo plan are also required. Target warm generation is at most 20 seconds on
the named demo laptop; this target is not a measurement.

## Evidence and remaining gates

Baseline `e63a237`, local Windows desktop preview, Chrome with hardware WebGPU:
one online generation and one offline full-reload generation were both
rejected. Their times aren't quoted, because the device wasn't recorded with
them. This baseline did not reproduce the earlier live deployment's fetch
failure, so its cause remains unconfirmed.

Oct 10, 2026 PH, branch based on `e63a237`: Windows desktop, Intel Core
i5-1155G7 / Iris Xe, headless Chrome 154, hardware WebGPU with shader-f16.
Production worker `webllm.worker-CiqCa1_8.js`, Qwen 0.5B q4f16, temperature 0.
Raw texts, facts, times and guard results of the fixed ten-plan corpus are in
[llm-validation-results.json](llm-validation-results.json). The complete-demo
and UI trials below are ad-hoc runs on the same device, with their steps listed
under each; their times are the panel's own measured "Written on this laptop ·
… s" line.

- Fixed ten-plan corpus: **8/10 accepted**. Manual review of all eight found
  preserved names, ordered scores/ranges, transfer directions/amounts and
  suggestions, with no added treatment instructions. This is a small synthetic
  trial, not an accuracy guarantee.
- The empty-action case returned a too-short response and was rejected. The
  two-priority/one-transfer case omitted a score and reversed the transfer; the
  guard rejected it. No rejected output was used as approval wording.
- Complete five-barangay demo (the committed four signed sample reports plus
  the synthetic phone fixture from `municipal.test.ts`): **3/3 consecutive
  accepted outputs**, 10,020 / 9,698 / 9,860 ms generation-only. All matched the
  supplied facts, including the Maligaya-D score range and Riverside-D transfer.
  Steps (ad-hoc): production preview build; laptop reset to the sample data;
  the four committed signed sample reports plus the synthetic phone fixture from
  `municipal.test.ts` received; `/municipal/plan`; "Write the wording with AI"
  three times in a row, model already cached; times from the panel.
- Separate UI trial: one online preparation then three full offline reloads,
  each with real inference and no failed dependency requests. Offline generation
  took 9.6 / 8.9 / 9.1 seconds. This trial used the incomplete four-barangay
  preview, whose transfer wording was rejected on every run. Inference/cache
  completion and wording acceptance are separate results.
- After integration with main `e274eef`, the complete demo was paired and its
  signed counts received through the actual laptop UI. One online draft and
  three full offline-reload drafts were **4/4 accepted**, with the fixed
  reminder in the officer's wording box. Offline generation took
  **12.4 / 12.6 / 12.0 seconds**, with no failed dependency requests.
  Steps (ad-hoc): production preview build; on the laptop UI, pair the phone
  fixture and receive its signed counts (five barangays); one online draft on
  `/municipal/plan`; then three times: network off in DevTools, full reload,
  draft again; times from the panel, dependency requests from DevTools. Integrated
  UI texts and hardware/browser details are also in the results JSON. Build,
  lint, app/E2E typechecks and the clean **950-test** unit run passed.
- Integrated Chromium production suite: 27 passed, 7 skipped (opt-in real-model and
  phase-2-only cases included). The independent-context signed return loop,
  reset/trust/duplicate/stale receipt checks, offline OCR and axe checks passed.
  The harness labels this machine "CI runner"; these were local runs.

The model remains optional. The incomplete four-barangay preview and some
transfer configurations can still produce rejected drafts; use the full
synthetic demo and review every draft, keeping the fixed plan as fallback.
Actual iPhone/Android QR scans, OCR/Hinga trials, the intended demo laptop/host's
commit parity, and three complete physical rehearsals remain separate device
checks. Desktop inference does not establish acceptance on the MacBook or phones.

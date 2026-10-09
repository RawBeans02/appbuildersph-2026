# ONE-PAGER — Agapay

**Challenge (official wording):** "Build an AI product that remains genuinely useful when the cloud disappears." (Theme: Local AI.)

**Problem (one sentence):** In the days after a typhoon, a barangay health worker in a flooded, no-signal barangay can't keep track of who waded through floodwater during the leptospirosis window, check which children in the evacuation center are breathing fast, or tell the municipal health officer where doctors and doxycycline are needed, because the signal is gone and the records are on paper.

**Who exactly:**
- the **barangay health worker (BHW)** or barangay health station midwife, using their own mid-range phone;
- the **municipal health officer (MHO)** at the rural health unit, who decides which barangay gets doctor teams and stock.

Context: DOH reported 11,965 leptospirosis cases as of Sept 9, 2026, 46% higher than the same period last year ([Daily Tribune, Sept 29, 2026](https://tribune.net.ph/2026/09/29/leptospirosis-cases-dip-slightly-but-2026-total-still-up-46)), and a DOH memorandum asks for regular monitoring of doxycycline stocks in barangay health units ([Philstar, Sept 16, 2026](https://www.philstar.com/nation/2026/09/16/2556541/more-doxycycline-capsules-distributed-curb-leptospirosis-cases)).

**Our solution (one sentence):** Agapay is an offline web app. On the BHW's phone, it checks a child's breathing rate with the camera (Hinga), turns a logged flood event into a leptospirosis watch list, and reads medicine-box lot and expiry dates to compare stock against need. It then passes only de-identified counts to the MHO's laptop by QR code, where a rule-based plan, optionally drafted by a local language model, waits for the officer's approval.

**The wow flow, step by step (the ~1-minute video and the 5-minute live demo; airplane mode on from second one, "Runs on this phone" visible):**
1. **Hinga:** the presenter breathes to a 45/min metronome as a "2-year-old"; the result is "Fast breathing for age: refer to the midwife or RHU now". Moving the phone makes it refuse to count.
2. **Flood event:** log the flood and tap 3 households as exposed, which opens the day-5–15 watch window.
3. **Stock:** scan a mock "DEMO" doxycycline box. The lot and expiry are read on the phone; the BHW confirms them.
4. **Exposure × stock:** "12 exposed · 40 capsules · 30 expire in 6 weeks → flag for clinician review." Never a dose.
5. **De-identified QR:** counts only. No names, small numbers shown as "<5".
6. **Municipal laptop (offline):** scan this QR plus 4 pre-made barangay QRs, merge them, and show the rule-based plan. The local model drafts the wording, constrained to the computed numbers; the officer edits and approves, and the approval is logged.
7. **Proof:** the network panel shows nothing left the phone except the QR on its screen.

**Where the AI is, and why it matters (not just a chatbot):**
- **Hinga:** a pose model finds the torso; signal processing turns the chest's movement into breaths per minute; a sound classifier rejects crying; a quality gate refuses bad readings.
- **OCR:** a text-recognition model reads lot and expiry from packaging.
- **Local LLM (optional):** narrates the plan. All counts, flags and allocations are deterministic rules; the AI never diagnoses or doses.

**What runs locally (model, size, runtime, devices):**
- **Phone:**
  - MediaPipe Pose Landmarker lite plus breathing-signal processing
  - YAMNet cry detection
  - PP-OCRv5 mobile (ONNX Runtime Web, WASM), with Tesseract.js as the iPhone fallback
  - records in IndexedDB, and QR generation
- **Laptop:** QR scanning, the merge and plan rules, and the optional AI wording: Qwen2.5-0.5B-Instruct (Apache-2.0) on WebLLM, WebGPU only; without WebGPU the template wording is used. The municipal laptop is our 8 GB M2 MacBook Air unless a teammate laptop is confirmed. An AMD (Lemonade on Ryzen AI) path only if a Ryzen AI laptop is confirmed by 7 PM.

Sizes go in the README as measured in our build.

**What requires internet (and what happens offline):** the first visit (the app) and "Prepare for offline" (the phone's models), both cached afterwards; on the laptop, the first use of the optional AI wording downloads its model from huggingface.co and raw.githubusercontent.com; and app updates. No AI inference needs the internet.

**Why does this product benefit from running AI locally?** It's needed in the days after a typhoon, when there is no signal. The data is about children and patients and should never leave the barangay. And a breathing count has to be computed live from the camera in an evacuation center, at no cost per use.

**Honest neighbors (never claim "first"):**
- Camera breathing counters exist: Breathwise (Devpost, RevenueCat Shipaton 2026), an open-source pediatric respiratory-rate project on GitHub, AIRR research (Malaria Consortium) and Lucy et al. 2021; links in the README.
- iClinicSys and SHINE OS+ have offline modes, and DOH runs eLMIS and a leptospirosis and dengue tracker.

Our difference: an ML-based check that refuses bad readings, built into the post-typhoon barangay workflow (exposure → watch list → stock → de-identified handoff → an approved municipal plan). It feeds existing systems; it doesn't replace them.

**Guardrails:**
- An unregistered research prototype and screening aid: it never diagnoses or doses, and gives refer-only output.
- DOH: doxycycline "may be given as prophylaxis to people exposed to floodwaters, but only after consultation with a health professional" ([Manila Times, Sept 3, 2026](https://www.manilatimes.net/2026/09/03/news/doh-leptospirosis-cases-in-ph-12-lower-than-last-year/2418017)); the same source gives symptoms 5–15 days after exposure, which sets the watch window.
- Synthetic data only: "San Isidro Demo" with residents named "Residente 001…".

**Design brief:** the Claude Design pass 1 brief (the Lead gives it to the owner); exports go into `design/`.

**Stack:**
- Frontend: Vite + React + TypeScript PWA (vite-plugin-pwa), static.
- Data: IndexedDB on the device.
- AI: MediaPipe Tasks (vision + audio), ONNX Runtime Web (PP-OCRv5), Tesseract.js fallback, WebLLM (laptop, optional).
- Hosting: Vercel; CI: GitHub Actions (checks + offline e2e).

**Out of scope for this build:**
- dengue checks
- hazard maps
- a DOH cloud upload
- dosing or diagnosis
- accounts and login
- real patient data
- an iPhone share target
- any cloud AI in the core offline flow (a cloud assistant is phase 2 only: opt-in, de-identified counts only, disclosed, decided at the midnight scope check)

**Business in one line (who pays, how it grows):** The MHO or LGU adopts it at no cost (a web app on BHWs' existing phones, no new hardware). It grows through a Local Health Board pilot, then the regional DOH center. A real pilot needs a privacy impact assessment and clinical validation of Hinga first.

**Rubric check (how the demo shows each official criterion in RULES.md):**
| Criterion (weight) | How we show it in the demo |
|---|---|
| Problem & Usefulness (25%) | The surge in leptospirosis cases, plus the BHW-to-MHO gap when the signal is down |
| Local AI Implementation (25%) | Airplane mode, a live camera count, OCR, and an LLM on the laptop, all with no network |
| Technical Execution (20%) | One phone and one laptop live; pre-made QRs; a recorded fallback for the sync step |
| Innovation (15%) | The combination and the refuse-to-count gate, with honest neighbors named |
| Product & Demo Quality (15%) | One flow, Claude Design UI, plain Filipino-context copy |

# AgapayMo copy deck, pass 1 and pass 2

Every string, by screen. Use word for word. Pass 2 strings are at the end, by frame ID. Every pass 1 “Agapay” is now “AgapayMo”. `{x}` = filled by the app. Sample values are in brackets after the placeholder. Tagalog on main actions and results is part of the label, after a middle dot (·), in a lighter color. No em dashes; ranges use an en dash (–).

## Shared

- Indicator (AI ready): `Runs on this phone` · laptop: `Runs on this laptop`
- Indicator (no signal): `Offline`
- Indicator sheet titles: see L5, L7
- Place line: `{municipality} · Sample data` [San Isidro Demo · Sample data]. Drop “· Sample data” when no seeded records are loaded.
- Privacy button label (screen readers): `Privacy and AI`
- Bottom nav: `Home` · `Watch list` · `Hinga` · `Stock` · `Send`
- Back / close (screen readers): `Back` · `Close` · `Cancel the check`
- Toast actions: `Undo`
- Retry: `Try again · Subukan ulit`
- Note on results: `Screening aid only. Not a diagnosis.`
- Dose note: `AgapayMo never suggests a dose. Doxycycline is given only after consultation with a health professional (DOH guideline).`
- Records error (any screen): `Couldn't open the records` / `Nothing was lost. Your records are still saved on this phone.` / `Still stuck? Close AgapayMo and open it again.`
- Loading records: `Opening the records on this phone…`

## 1 · Home

- Title: `{barangay}` [Maligaya-D]
- Flood card: `Flood watch` · `Since {weekday, Mon D}` [Since Sun, Oct 4] · `Day {n} of 15` · `{puroks}` [Purok 1, 2, 3] · `Watch window {Mon D} to {D}` [Watch window Oct 9 to 19]
- Section: `Today, {weekday Mon D}` [Today, Sat Oct 10]
- Row: `{n}` `On the watch list` · `{a} in the window now · {b} start {Mon D}` [9 in the window now · 3 start Oct 15]
- Row: `{n}` `Child with fast breathing` / `Children with fast breathing` · `Referred {weekday, Mon D}` [Referred Tue, Oct 6]
- Row: `{n}` `Doxycycline capsules` · `{n} expire within 6 weeks`
- Primary: `Check breathing · Hinga`
- Empty: `Nothing recorded yet` / `Start with a breathing check. When floodwater reaches the barangay, log the flood to start a 15-day leptospirosis watch.` / link `Log a flood`
- Error: records error (Shared) + primary `Try again · Subukan ulit`, secondary `Check breathing`

## 2 · Hinga step 1

- Step: `Hinga · step 1 of 3`
- Title: `How old is the child?`
- Sub: `The cut-off for fast breathing depends on age.`
- Options: `Under 2 months` `Fast: 60 or more a minute` · `2 to 11 months` `Fast: 50 or more a minute` · `1 to 4 years` `Fast: 40 or more a minute`
- Section: `Before you start`
- Checkbox: `The child is calm: not crying, not feeding, and the chest is visible.`
- Field: `Link a resident` `(optional)` · value `{Residente 010} · {HH-02}`
- Primary: `Next: point the camera`

## 3 · Hinga step 2 (framing)

- Step: `Hinga · step 2 of 3`
- Instruction: `Point at the chest. Hold the phone still.`
- Guide label: `Chest here` → `Chest found`
- Status: `Looking for the chest…` → `Chest found. Ready to count.`
- Primary: `Start counting · Simulan` (disabled label: `Start counting`)
- 3c pre-permission: `Next, allow the camera and microphone` / `The camera counts breaths. The microphone listens for crying. No video or sound is saved, and none of it leaves this phone.` / `Continue`
- 3d blocked: `The camera is blocked` / `Hinga can't count without it. To allow it, open this site's settings in your browser and turn on Camera.` / primary `Count by hand with a timer` / link `I turned it on: try again`

## 4 · Hinga step 3 (counting)

- `Cancel` · countdown `{m:ss}` [0:42] `left`
- Headline: `Hold still` · `step 3 of 3`
- Trace label (screen readers): `Breathing trace`
- Mic line: `Listening for crying. No video or sound is saved.`

## 5 · Hinga refusals

- Top bar: `Count stopped`
- Under every message: `Nothing was saved.` · button `Try again · Subukan ulit`
- 5a `Crying detected` / `Wait until the child is calm, then count again. Crying changes the breathing rate.`
- 5b `Too much movement` / `Steady the phone. Rest your elbows on your knees or a table, and keep the chest inside the box.`
- 5c `Can't see the chest clearly` / `Move to brighter light or lift the shirt. Keep the whole chest inside the box.`
- 5d `Readings didn't agree` / `The phone counted two ways and got different numbers, so this count isn't safe to use.`
- 5e (second refusal in a row, any reason) e.g. `Still too much movement` / `Rest the phone on something steady and try once more, or count by hand. The app keeps the time and applies the cut-off.` · primary `Try again · Subukan ulit` · secondary `Count by hand with a timer`

## 6 · Hinga result, fast

- Meta: `{Residente 010} · {HH-02} · {1 to 4 years} · {8:31 AM}` (no resident: `{1 to 4 years} · {8:31 AM}`)
- Band: `Fast breathing for age` · `{52}` `breaths a minute` · `The cut-off for {1 to 4 years} is {40}.`
- Headline (h1): `I-refer ngayong araw` · `Refer to the midwife or RHU today.`
- Checklist title: `Check for danger signs` · `Tick any you see, or None of these. Any sign makes this URGENT.` (after a tick: `{n} ticked`)
- Signs: `Chest pulls in when breathing in (chest indrawing)` · `Harsh noise when breathing in (stridor)` · `Can't drink or breastfeed` · `Vomits everything` · `Convulsions (kombulsyon)` · `Very sleepy or hard to wake` · then `None of these`
- Primary: `Save to the record · I-save`, disabled until a sign or None of these is ticked, with the hint `Tick any danger signs, or None of these, to save.`
- 6b URGENT band: `Urgent · danger sign` · `{52}` `breaths a minute` · `Fast for {1 to 4 years} (cut-off {40}), and {chest indrawing}.`
- 6b headline: `I-refer agad` · `URGENT: bring the child to the RHU now. Don't wait for the next check.`
- 6b primary: `Save as URGENT · I-save`
- 6c saved: `Saved to {Residente 010}'s record` · `No danger signs · {8:32 AM}` (or `{n} danger sign(s) ticked`) · primary `Done · Tapos na` · secondary `Check another child`
- Counted by hand (L8b result): add `Counted by hand` to the meta line.

## 7 · Hinga result, not fast

- Band: `Not fast breathing for age` · `{38}` `breaths a minute` · `The cut-off for {2 to 11 months} is {50}.`
- Headline: `Hindi mabilis ang paghinga` (h1) · `Not fast breathing for this age.`
- Section: `When to check again` · `In 5 days if the child isn't getting better. Right away if breathing gets faster or harder, or the child can't drink.` (WHO IMCI 2014)
- Row: `See a danger sign? Refer now, whatever the count.`
- Primary: `Save to the record · I-save` · link `Check another child`

## 8 · Flood event

- Step: `Step 1 of 2` / `Step 2 of 2`
- 8a title: `Log a flood` · `This starts the leptospirosis watch for everyone who waded in the water.`
- Field: `The flood started on` · value `Today, {Sun Oct 4, 2026}`
- Field: `Areas with floodwater` `(optional)` · chips `Purok {n}`
- Note: `Kept on this phone only. Never in the QR.`
- Primary: `Next: mark who was exposed`
- 8b title: `Who waded in floodwater?` · `Tap a household to mark everyone in it. Tap again to undo.`
- Group: `Purok {n}` · row `{HH-01}` `{4} people` / `1 person`
- Detail chips: `Waded` · `Open wound` · `Repeated`
- Footer: `{9} people marked` · `{3} households` · primary `Confirm and start the watch`
- 8c sheet: `Start the watch for {9} people?` / `They were in the floodwater today. Watch them from {Fri, Oct 9} to {Mon, Oct 19} (days 5 to 15).` / `If one gets fever, muscle pain or red eyes, refer them to the RHU physician.` / primary `Start the watch · Simulan` / link `Back to the list`
- Toast after: `Watch started for {9} people.`
- No residents: `No residents on this phone yet.`

## 9 · Watch list

- Title: `Watch list` · `Leptospirosis watch · {Maligaya-D} · Sample data`
- Note: `Refer to the RHU physician if anyone here has fever, muscle pain or red eyes.`
- Sections: `In the window now` `{9}` · `Starts soon` `{3}`
- Row: `{Residente 002}` · `{HH-01} · {Purok 1} · {waded, open wound}` · `Day {6}` `of 15` · upcoming: `Starts {Oct 15}` `in {5} days` · `waded today`
- Pill: `Higher risk`
- Row status: `Checked {8:15 AM}` · `Referred to RHU, {Oct 9}`
- Primary: `Mark more people exposed`
- 9b sheet: `{Residente 004}` · `{HH-01} · {Purok 1}` · `In the floodwater` `{Sun, Oct 4} · {waded, repeated}` · `Watch` `{Oct 9} to {Oct 19} · day {6}` · `Risk` `Higher: {repeated contact}` / `Higher: {open wound}` · `Fever, muscle pain or red eyes? Refer to the RHU physician.` · primary `Checked today: no signs` · secondary `Referred to the RHU`
- Exposure words: `waded` · `open wound` · `repeated`
- 9c empty: `No one on the watch list` / `Log a flood and mark who waded in the water. They show here from day 5 to day 15.` / primary `Log a flood`

## 10–11 · Stock: scan and review

- 10a guide: `Fit the lot and expiry inside the box` · tip `Glare? Tilt the box away from the light.` · link `Type it in` · shutter label `Take photo` · `Read on this phone. The photo is deleted after.`
- 11a: `Read on this phone in {2.4} s.` `The photo is deleted when you leave.`
- Title: `Check what was read` · `Fix anything that's wrong. Nothing is saved until you confirm.`
- Fields: `Medicine` · `Strength` · `Lot number` · `Expiry` · `How many on hand` + unit (`capsules`, `tablets`, `sachets`, `bottles`)
- Tags: `Sure` · `Please check` · `Not read`
- Helpers: `Read with low confidence. Compare it with the box.` · `The phone couldn't find it. Please type it.` · `Count what is in the box. The phone doesn't guess this.`
- Validation: `Type the medicine name.` · `Type the lot number.` · `Pick the expiry month.` · `Type how many {capsules} are in the box.`
- Disclosure: `All text read from the box`
- Primary: `Confirm · Kumpirmahin` · link `Scan again`
- Manual entry title: `Add stock by hand`
- Error (L9c): `Couldn't read the label` / `The text was too blurry or shiny. Try again, or type it in.` / primary `Scan again` / secondary `Type it in`
- Toast after confirm: `Saved: {Doxycycline 100 mg}, lot {DEMO-LOT-24A}.`

## 12 · Stock list

- Title: `Stock` · `{Maligaya-D} health station · Sample data`
- Link row: `Exposure and stock` · `{12} exposed · {40} doxycycline capsules`
- Sections: `Expires within 6 weeks` · `All stock`
- Row: `{Doxycycline 100 mg}` · `{DEMO-LOT-24A} · EXP {Nov 2026}` · `{30}` `{capsules}`
- The `Expires within 6 weeks` group heading carries the clock icon (no pill on its rows). Pill for expired lots: `Expired: set aside`
- Primary: `Scan a box`
- Empty: `No medicine recorded yet` / `Scan a box to add its lot and expiry. It takes a few seconds and works offline.` / link `Type it in instead`

## 13 · Exposure and stock

- Title: `Exposure and stock` · `{Maligaya-D} · Sample data`
- Rows: `{12}` `people exposed to floodwater` · `{40}` `doxycycline capsules on hand` · `{30}` `of them expire within 6 weeks`
- Section: `Why a clinician should look` + the rule reasons, verbatim from `reviewExposureStock()`:
  - `{12} residents are in or near the leptospirosis watch window.`
  - `No usable doxycycline capsules on hand.`
  - `{30} doxycycline capsules expire within 6 weeks.`
  - `{n} capsules are past expiry: set aside.`
- Section: `Doxycycline lots` · `{DEMO-LOT-24A}` · `EXP {Nov 2026} · within 6 weeks` / `EXP {Jul 2027} · usable` · `{30} capsules`
- Primary: `Flag for clinician review · I-flag`
- 13b: `Flagged for clinician review` · `{Sat, Oct 10, 9:01 AM}. It goes in the next QR as a count.` · secondary `Mark as reviewed`
- No doxycycline: `No doxycycline recorded.` link `Scan a box`

## 14 · Send

- Title: `Send to the RHU` · `{Maligaya-D} · Week {2026-W41} · Sample data`
- Heading: `What leaves this phone` · `Only these counts. No names, birthdays or addresses.`
- Groups and rows: `Exposed, watch not started yet, by age` (`Under 2 months`, `2 to 11 months`, `1 to 4 years`, `5 to 17 years`, `18 to 59 years`, `60 and over`) · `In the watch window now` · `Fast-breathing referrals, by age` (first three bands) · `URGENT referrals` · `Doxycycline capsules on hand` · `Of those, expiring within 6 weeks` · `Flags for clinician review`
- Footnote: `“<5” means 1 to 4. Small numbers are hidden so no household can be singled out.`
- Meta: `Export #{3} · signed on this phone`
- Primary: `Show the QR · Ipakita`
- 14b: `Show this to the municipal laptop` · code line `{SID-MAL} · {2026-W41} · #{3}` · `Hold the phone steady in front of the laptop's camera. Turn the brightness up if it doesn't scan.` · primary `Done, it was scanned · Tapos na` · link `What's in this QR` · image alt `QR code with this week's counts`
- 14c: `Marked as shared` · `Export #{3} for week {2026-W41}, shown at {9:05 AM}. Only the counts left this phone, and only as the QR.` · link `See what was shared` · primary `Back to Home`
- QR error: `Couldn't make the QR` / `Nothing was sent. Try again.` / `Try again · Subukan ulit`

## 15 / L10 · Privacy & AI

- Title: `Privacy & AI`
- `What runs on this phone`
  - `Breathing check (Hinga)` · `Uses the camera to count breaths. The video is never saved.`
  - `Crying check` · `Listens for crying during a count. Sound is never saved.`
  - `Medicine-box reader` · `Reads the lot and expiry from a photo. The photo is deleted after reading.`
  - `Your records` · `Residents, floods, checks and stock stay in this phone's browser storage.`
- `What leaves this phone` · `Only the counts in the QR code, and only when you show it to the municipal laptop. No names, birthdays or addresses. Counts from 1 to 4 show as “<5”.` · link `See exactly what the QR holds`
- `What the AI can get wrong`
  - `It can miscount breaths if the child moves or cries, or the light is poor. When it can tell, it stops and says why.`
  - `It can misread a lot number or expiry. You check every field before anything is saved.`
  - `On the municipal laptop, AI drafts the plan's wording. The officer checks it before approving.`
- `AgapayMo never diagnoses and never suggests a dose. It counts, flags and refers.`
- Footer: `Research prototype, not a registered medical device. San Isidro Demo and every record in it are invented sample data.`

## Local AI states

- L1a: `Get AgapayMo ready for no signal` / `Download the AI once, so AgapayMo works without internet. After this, nothing you do needs a signal.`
  - Parts: `Breathing check (Hinga)` `Counts breaths with the camera` · `Crying check` `Hears if the child is crying` · `Medicine-box reader` `Reads the lot and expiry` · sizes `{15.2} MB`
  - `Total, one time` `{55.1} MB` · `Use Wi-Fi if you can. This phone has {2.1 GB} free.`
  - Primary `Download {55.1} MB · I-download` · link `Later`
- L1b: `Downloading the AI` / `So AgapayMo works without internet. Keep this screen open.` · `{1} of 3: {Breathing check}` · `{9.8} / {55.1} MB` · `{17}%` · row states `Downloading` `Waiting` `Done` · secondary `Cancel`
- L2: `Not enough space on this phone` · `AgapayMo needs` `{55.1} MB` · `Free now` `{21.4} MB` · `Free up about {34} MB, then check again. Deleting old videos or an app you don't use is usually enough.` · primary `Check again` · link `Use AgapayMo without the AI for now`
- L3: `Next, your browser may ask to keep AgapayMo's files` / `Tap Allow, so the AI isn't deleted when the phone runs low on space.` / `Continue`
- L4: `Getting the AI ready` / `Loading it into this phone's memory. This takes a few seconds.`
- L5: `Runs on this phone` / `The AI is saved on this phone and works with no signal. Your records stay here. Only counts leave, in the QR.` · rows + `Ready` · link `What stays on this phone`
- L6a/b: `Reading the box` · `Finding the text` `step 1 of 2` · `Reading the text` `step 2 of 2` · `Reading on this phone. The photo is deleted after.` · `Cancel`
- L7: `Offline. Everything here still works.` / `Breathing checks, the watch list, stock and the QR all work with no signal. Only the first download and app updates need internet.` / `Got it`
- L8a: `This phone can't run the camera check` / `Its browser can't run the breathing AI. Updating Chrome or Safari may fix this.` · `You can still` · `Count breaths by hand with a timer` · `Keep the flood watch list` · `Add medicine stock by typing` · `Send the QR to the RHU` · primary `Count by hand with a timer`
- L8b: `Stop` · `{0:29}` `left` · `Count by hand` · `Watch the chest rise. Tap once for each breath.` · button `Tap for each breath` · `{1 to 4 years} · fast is {40} or more a minute`
- L9a: `The download stopped` / `The signal dropped at {9.8} of {55.1} MB. Connect to Wi-Fi or mobile data, then try again. What already downloaded is kept.` / `Try again · Subukan ulit`
- L9b: `The breathing check couldn't start` / `Its files are on this phone, but it didn't load. Closing other apps usually fixes this.` / `Try again · Subukan ulit` (other models: `The crying check couldn't start`, `The box reader couldn't start`)
- L9c: see screen 11.

## 16 · Municipal home (laptop)

- Nav: `AgapayMo` `Municipal view` · `San Isidro Demo · Sample data` · `Scan QR codes` · `Merged view` · `Plan` · `Approval log` · `Privacy & AI`
- Title: `Barangay reports` · `Week {2026-W41} · {Oct 5 to 11}`
- Panel: `Scan a barangay QR` · `The health worker shows the QR on their phone. Only counts come in: no names, birthdays or addresses.` · `The camera is off` · primary `Scan a barangay QR`
- List: `Received this week` `{2} of 5` · `{9:05 AM} · export #{3}` · pills `Received` `Waiting`
- Secondary: `Open the merged view ({2} of 5)`

## 17 · Scan (laptop)

- Title: `Scan a barangay QR` · `Week {2026-W41} · {2} of 5 received`
- `Looking for a QR` · `Hold the phone's QR inside the square, about a hand's length from the camera.` · secondary `Stop the camera`
- Success: `{Santo Niño-D} received` · `Week {2026-W41} · export #{4} · signed by the paired {Santo Niño-D} phone.` · `Ready for the next barangay.` · list `Just now` · secondary (narrow column) `Merged view ({3} of 5)`
- Already: `Already received` · `{Maligaya-D} export #{3} came in at {9:05 AM}. Nothing changed.`
- Invalid: `Not a valid AgapayMo QR` · `It isn't from a paired AgapayMo phone, so nothing was saved. Ask the health worker to open Send on AgapayMo.`
- Newer: `{Maligaya-D} updated` · `Export #{4} is newer, so it replaces #{3}.`
- Camera blocked: `The camera is blocked` · `Allow the camera for this site in the browser settings, then try again.` · `Try again`

## 18 · Merged view

- Title: `Merged view` · `Week {2026-W41} · {5} of 5 barangays · Sample data` · primary `Make the plan`
- Columns: `Barangay` · `Received` · `Exposed` · `In watch window` · `Fast-breathing referrals` · `Doxycycline on hand` · `Expiring in 6 weeks`
- Pill: `Priority` · total row `All 5 barangays` (fewer: `{3} of 5 barangays`) · waiting row `Waiting` with dashes
- Reason: `Why {Maligaya-D} first:` `the most residents in the watch window ({9}), fast-breathing referrals ({1–4}), and {30} of its {40} capsules expire within 6 weeks.`
- Footnote: `Ranges include counts sent as “<5” (1 to 4 people), which phones use to protect small households. No names, birthdays or addresses reach this laptop.`
- 18b (fewer than 5): sub `Week {2026-W41} · {3} of 5 barangays · Sample data` · waiting rows `Waiting` with dashes · total row `{3} of 5 barangays` · note `Totals cover the {3} barangays received so far. {Mabini-D and Riverside-D} are not counted yet.`

## 19 · Plan

- Title: `Plan for week {2026-W41}` · `From {5} of 5 barangays · Sample data`
- `The plan` · `Made by fixed rules from the counts. Always available, with or without the AI.`
- Steps (rule output): `Send a doctor team to {Maligaya-D} first.` · `Move {60} capsules from {Bagong Silang-D} to {Maligaya-D}.` · `Use the {40} capsules that expire within 6 weeks first.` + their reason lines
- Note: `No doses. Doxycycline is given only after consultation with a health professional (DOH guideline).`
- Panel title (all states): `Draft wording by the on-device AI: check before approving`
- Done: `Written on this laptop · {Qwen2.5 0.5B} · {6.2} s` · `info` `No new numbers found; check each number against the plan steps` (never “all numbers match”) · mismatch (19e): `{1} number doesn't match the plan: {70}. The plan says {60}.` · approve hint `Fix the number to approve.` · link `Write it again`
- Loading: `Downloading the writing AI` · `First time only. After this it runs on this laptop with no internet.` · `{412} / {879} MB · {46}%` · `The plan on the left works without it. You can approve now and skip the wording.` · secondary `Cancel the download`
- Drafting: `Writing on this laptop` · `Writing from the plan's numbers…` · secondary `Stop`
- Off: `The writing AI is off on this laptop` · `This laptop can't run it. The plan still works: approve it as listed, or write the wording yourself.` · field label `Wording` `(optional)`
- Approve bar: `Approved by` · `Municipal health officer` · primary `Approve plan`
- Toast after: `Plan approved and saved to the log.`

## 20 · Approval log

- Title: `Approval log` · `Kept on this laptop only · Sample data`
- Columns: `When` · `Approved by` · `Plan` · `From` · `Wording`
- Values: `{5} of 5 barangays` · wording `AI draft` / `AI draft, edited` / `Rules only`
- Empty (20b): `No plans approved yet` / `Approved plans show here, with who approved them and when.` / primary `Go to the plan`

## 404

- `404` · `Walang ganitong page.` · `This page isn't part of AgapayMo. Your records are safe on this phone.` · primary `Go to Home · Pumunta sa Home` (laptop: `Go to the municipal home`)
- Page title: `Page not found · AgapayMo`


---

# Pass 2

Sample values follow the demo timeline: four barangays in by 9:20 AM, Maligaya-D's QR lands at 10:48 AM, approval at 10:52 AM, the phone receives at 11:05 AM (Sat, Oct 10, 2026, week 2026-W41). Every date and time goes through the app's date helpers.

## Settled

- Name: `AgapayMo` in all copy, LaptopNav and the 404. Page titles: `{Screen} · AgapayMo`.
- Age bands: `Under 2 months` · `2 to 11 months` · `1 to 4 years` (residents also `5 to 17 years` · `18 to 59 years` · `60 and over`).

## 0 · Intro (0a–0c)

- Every card: `Skip` · read with each h1: `Step {1} of 3`
- 0a: brand `AgapayMo` · h1 `Health checks after a typhoon, kahit walang signal.` · `AgapayMo is for barangay health workers. It helps you keep track of who to check, what medicine you have, and what your barangay needs from the RHU.` · primary `Next · Susunod`
- 0b: h1 `What you can do with AgapayMo` · primary `Next · Susunod`
  - `Keep a flood watch list` / `Mark who waded in floodwater. The list shows who to ask about fever, muscle pain or red eyes, from day 5 to day 15.`
  - `Read medicine boxes` / `Take a photo of the box. The phone reads the lot and expiry, and you check them before saving.`
  - `Check a child's breathing · Hinga` / `The camera counts breaths for one minute and applies the cut-off for the child's age. Screening aid only.`
  - `Report to the municipality by QR` / `Show a QR to the RHU laptop. Only counts leave, never names. Instructions come back the same way.`
- 0c: h1 `Works with no signal` · loop labels `This phone` · `QR` · `RHU laptop` · `QR` · `This phone`
  - `The AI runs on this phone and your records stay here. Only name-free counts leave, in a QR you show to the RHU laptop. The approved plan comes back the same way. After the one-time download, none of it needs internet.`
  - Status, AI ready: `Runs on this phone` (LocalStatus) · AI not downloaded: `Get the AI ready first: {55.1} MB, once, on Wi-Fi`
  - Primary `Start · Simulan`
  - Caption (sample data only): `You'll start in {Maligaya-D}, a sample barangay in {San Isidro Demo}. Every name and number in it is made up. Sample data (DEMO).`

## 1e–1i · Home, story-led

- Brand row: `AgapayMo` · shield (screen readers) `Privacy and AI`
- Purpose: `Health checks for your barangay after a typhoon, kahit walang signal.` · link `How it works`
- Section: `Today, {weekday Mon D}` [Today, Sat Oct 10]
- AI row (1f): `Get ready for no signal` / `Download the AI once on Wi-Fi: {55.1} MB. Then the breathing check and the box reader work offline.`
- Instructions row (1g): `Instructions from the RHU` / `Received {weekday, Mon D, h:mm AM} · {2} actions` [Received Sat, Oct 10, 11:05 AM · 2 actions] (1: `· 1 action`). The visit right after saving: `Received just now · {2} actions`
- Watch row: `{9} people in the watch window today` (1: `1 person in the watch window today`) / `{2} higher risk · Ask about fever, muscle pain or red eyes.` (none higher risk: `Ask about fever, muscle pain or red eyes.`)
- Watch row, nobody in the window yet: `{3} people start their watch {Thu, Oct 15}` (1: `1 person starts their watch {Thu, Oct 15}`) / `Their watch window opens on day 5 after the flood.`
- Expired row: `{10} capsules are past expiry` (1: `1 capsule is past expiry`) / `Set aside, not counted as on hand.`
- Expiring row: `{30} doxycycline capsules expire within 6 weeks` (1: `1 doxycycline capsule expires within 6 weeks`) / `Use these first · {40} on hand`
- None expiring: `{40} doxycycline capsules on hand` / `None expire within 6 weeks.`
- Flag row: `{1} flag waiting for clinician review` / `It goes in the next QR as a count.` · plural `{2} flags waiting for clinician review` / `They go in the next QR as counts.`
- Send row: `Send this week's counts to the RHU` / `Week {2026-W41} · only counts leave, by QR`
- Breathing line: `{1} child referred this week after a breathing check · last {Tue, Oct 6}` (plural `children`) · second line when any were URGENT: `{1} of them URGENT`
- Receive link: `Got a QR from the RHU? Scan it`
- 1g live region: `Instructions from the RHU saved on this phone.`
- 1g sheet: `Approved instructions for {Maligaya-D}` · `Week {2026-W41} · Municipal health officer · approved {Sat, Oct 10, 10:52 AM}` · actions in B31 wording · `Stock logistics only, never doses. Receiving instructions does not change inventory or mark actions completed.` · `Close`
- 1h sheet (P1): `Breathing checks this week` · row `{8:31 AM} · {1 to 4 years}` · pills `Refer today` · `URGENT` · `Not fast` · `Count stopped` · extra `Counted by hand` · `Close`
- 1e P1 watch meta: `{6} not checked yet today` / `All checked today`
- 1e P1 flood card bracket: `Watch window {Oct 9 to 19}`
- 1e P1 report strip: before instructions `Next: show your QR to the RHU laptop.` · after `Instructions back from the RHU · {Sat, Oct 10, 11:05 AM}`
- 1i (P1): `Nothing recorded yet` · h2 `Start here` · `Log a flood` / `Mark who waded in, to start the 15-day leptospirosis watch.` · `Scan a medicine box` / `Reads the lot and expiry on this phone.` · plus the AI row when not downloaded

## Purpose lines (P1)

- 2a: `Counts a child's breaths with the camera, on this phone.`
- 9a: `Who to visit today, from the flood records on this phone.`
- 12a: `Know which doxycycline to use first, before it expires.`
- 13a: `The watch list and the medicine on hand, for a clinician to review.`
- 14a: `Tell the RHU what your barangay needs. Only counts leave, by QR.`
- 18: `Every barangay side by side, so the doctor team goes where it's needed first.`
- 19: `A plan from fixed rules. Check it, approve it, send it back by QR.`

## L10b · Privacy & AI

- New top row: `How AgapayMo works` / `What it does, and how it works with no signal`

## M4 · First paint

- `Opening AgapayMo…`

## 11b · Box reader on the photo

- Measured: `Read on this phone in {1.2} s, after {3.4} s getting the AI ready.`
- Caption: `{4} lines found. Each box is a line the phone read. The numbers match the fields below.` then `The photo is deleted when you leave.` (1 line: `1 line found. The box is the line the phone read. The number matches the field below.`)
- Photo alt: `The box you photographed, with the {4} lines the reader found outlined.`
- Disclosure `All text read from the box`: the lines in order, then `Read by {PP-OCRv5} on this phone` (the engine actually used)
- Live region: `Read {4} lines on this phone. Check the numbered fields.`

## 4b · 3b · Hinga (P1)

- 4b trace label `Breathing` · under it `The line follows the chest. The count shows after the minute.`
- 3b: `Chest here` becomes `Chest found`

## 8c · 8d · 9a · 13 · 14 (P1)

- 8c bar: `Watch window: days 5 to 15` · `{Fri, Oct 9}` under segment 5 · `{Mon, Oct 19}` under segment 15
- 8d footer: `{9} people marked · {3} households` (1: `1 person marked · 1 household`)
- 9a new rows: `Added today`
- 13b: `Flagged for clinician review` (as pass 1)
- 14d receipt: `This QR holds {14} counts and no names.` · `{282} bytes · signed on this phone · export #{3}` · `Key {3109-7D1D-0CAB-216B}`
- 14c: `Marked as shared` (as pass 1)
- 13a bar (P2): `Expire within 6 weeks {30}` · `Usable after that {10}` · `Set aside, not counted {10}`

## Laptop: LoopStrip, 16b, 17g, 17h

- LoopStrip (list label, screen readers `This week's reports`): `Reports in` · `{4} of 5` · `Merged` · `{4} barangays` / `Waiting for reports` · `Plan` · `{3} steps` / `No reports yet` · `Approved` · `{10:52 AM}` / `Not yet` · `Back to the barangay` · `Return QR ready` / `After approval`
- 16b: `Barangay reports` · `Week {2026-W41} · {Oct 5 to 11} · Sample data` · `Scan each barangay's QR. This laptop checks it, merges the counts and makes a plan for you to approve. None of it needs internet.` · `Received this week` · `{4} of 5` · newest row `Just now · {10:48 AM} · export #{4}` · 5 of 5 primary `Open the merged view (5 of 5)`
- 16b live: `{Maligaya-D} received. {5} of 5 barangays in.`
- 17g: h2 `{Maligaya-D} received`
  - `Read the QR: counts only, no names`
  - `Signed by the paired {Maligaya-D} phone` · `Key {3109-7D1D-0CAB-216B}`
  - `Week {2026-W41} · export #{4}, the newest from this phone` or `Export #{4} is newer, so it replaces #{3}.`
  - `Added to the merged view · {5} of 5 in`
  - Then `Ready for the next barangay.` · at 5 of 5: `All 5 barangays are in.` · primary `Open the merged view` · `Stop the camera`
  - Under the webcam: `The camera stays on. Hold the next phone's QR inside the corners.`
  - Live: `{Maligaya-D} received. {5} of 5 barangays in.`
- 17h (the list stops at the failed line):
  - Not an AgapayMo QR, damaged, or another version: h2 `Not a valid AgapayMo QR` · `Couldn't read this as AgapayMo counts` · `It isn't from a paired AgapayMo phone, so nothing was saved. Ask the health worker to open Send on AgapayMo.`
  - Wrong signature: h2 `Not saved` · `Not signed by the phone paired for {Maligaya-D}. Nothing was saved.` · `If {Maligaya-D} has a new phone, pair it first.`
  - No phone paired: h2 `Not saved` · `No phone is paired for {Maligaya-D} yet. Nothing was saved.` · `Scan the pairing QR on that phone's Send screen first, then its counts QR.`
  - Another municipality: h2 `Not saved` · `From another municipality. Nothing was saved.`
  - Already received: h2 `Already received` · `Already have export #{4} from {9:12 AM}. Nothing changed.`
  - Older export (B19): h2 `Already received` · `Kept the newer export #{4}.`

## Laptop: 18c, 18d, 19, 20, 22a

- 18c: `Week {2026-W41} · {5} of 5 barangays · Sample data` · newest row `Just now`
- 18d (P1): h2 `Doctor-team order` · `Made by fixed rules from the counts: URGENT referrals count 3 times, fast-breathing referrals 2 times, people in the watch window once.` · legend `URGENT referrals × 3` · `Fast-breathing referrals × 2` · `In the watch window × 1` · bar text alternative `{Maligaya-D}: score {14–17}. URGENT referrals {0}, fast-breathing referrals {1–4}, in the watch window {9}.` · `Priority changed: {Maligaya-D} is now first, after its report came in.`
- 19f: `Made by fixed rules from {5} of 5 reports · updated {10:48 AM}` · `Why:` + the step's existing reason, word for word
- 19c P1: no new strings. The check line stays `No new numbers found; check each number against the plan steps`.
- 19g: button while saving `Approving…` · `Approved` · `By the Municipal health officer · {Sat, Oct 10, 10:52 AM}` · `Saved to the approval log on this laptop.` · primary `Make return QR` · link `Open the approval log` · toast and live region `Plan approved and saved to the log.`
- 19h: `Wording is optional. The plan on the left is complete.` · link `Write the wording yourself`
- 20c (P1): newest row `Just now`
- 22a / B30 (P1): title `Return instructions QR` · `Week {2026-W41} · approved {Sat, Oct 10, 10:52 AM}` · field `Recipient barangay` · primary `Generate return QR` · next to the fingerprint `On the barangay phone, open Receive RHU instructions. Before first trust, compare this fingerprint:` · `Key {5E21-9A0C-77B4-D31F}` · empty `No doctor-team or stock-transfer actions apply to this approval.`

## 21a / B31 · Receive RHU instructions (phone)

- Title `Receive RHU instructions` · `Instructions from the RHU laptop, checked on this phone.` · primary `Scan the return QR · I-scan` · secondary `Choose a QR image` · field `Or paste the QR text` · helper `The phone checks it as soon as you paste.`
- Check lines: `Read the QR` · `Signed by the RHU laptop` · `Key {5E21-9A0C-77B4-D31F}` · `For {Maligaya-D}, week {2026-W41}`
- Preview: `Approved instructions for {Maligaya-D}` · `Week {2026-W41} · Municipal health officer · approved {Sat, Oct 10, 10:52 AM}`
  - `Send a doctor team to {Maligaya-D} first. Watch window: {9} residents.`
  - `Move up to {60} capsules from {Bagong Silang-D} to {Maligaya-D}.`
  - `Stock logistics only, never doses. Receiving instructions does not change inventory or mark actions completed.`
- First trust: `Compare with the RHU laptop` · `The first time, check that this fingerprint matches the one on the RHU laptop's screen.` · checkbox `The fingerprint matches the RHU laptop` · hint while unticked `Compare the fingerprint first.` · primary `Save on this phone · I-save`
- Success: `Instructions saved on this phone` · `Week {2026-W41} · {2} actions for {Maligaya-D}` · primary `Back to Home · Bumalik sa Home` · duplicate `Already saved on this phone` · live `Instructions saved on this phone.`
- Errors (B31), each one line plus one next step:
  - Key changed: `The RHU laptop's key has changed` / `Nothing was saved. Ask the RHU to reset the pairing, then compare the new fingerprint.`
  - Older approval: `This is an older approval` / `You already have a newer one from {Sat, Oct 10, 10:52 AM}. Nothing changed.`
  - Another barangay: `This QR is for {Riverside-D}` / `Nothing was saved. Ask the RHU for the QR for {Maligaya-D}.`
  - Unsupported version: `This QR is from another AgapayMo version` / `Nothing was saved. Ask the RHU to make the QR again.`
  - No QR in the image: `No QR found in this image` / `Try a sharper photo with the whole QR in it, or scan it with the camera.`
- Retired: `Signature verified. Review the instructions before saving.` · `This signature proves possession of a key.`

## Section B strings

- B1 (8b, earlier day): `waded {Sun, Oct 4}` · a tap adds today: `waded {Sun, Oct 4} and today` and the `Repeated` chip turns on
- B2 (8b confirm): `Only today's marks change. Earlier days stay as they were.`
- B3 (8b empty): `No residents on this phone yet.` (as pass 1)
- B4 (9b): `Risk` · `Not higher risk` / `No open wound or repeated wading recorded.` · several days `Waded {Sun, Oct 4} and {Tue, Oct 6}` · `Watch window {Oct 9 to 21}` (dates from the watch rule)
- B5 (9b toast): `Checked {8:15 AM}` · `Undo` · referred `Referred {8:15 AM}` · `Undo`
- B6 (10a camera blocked): `The camera is blocked` / `Choose a photo of the box instead, or type it in.` · primary `Choose a photo of the box` · link `Type it in`
- B7 (reader not prepared): `The box reader isn't on this phone yet` / `Get it ready once on Wi-Fi ({26.9} MB). After that it reads boxes with no signal.` · primary `Prepare for offline` · link `Type it in`
- B8 (12a remove): `Remove lot {DEMO-LOT-24A}?` / `Its {30} capsules stop counting as on hand. This can't be undone.` · destructive `Remove the lot` · `Keep it`
- B9 (expired lot): `Expired · set aside, not counted as on hand`
- B10 (pairing QR sheet): `Pair with the RHU laptop` / `Show this QR to the RHU laptop once. The laptop must show this code: {3109-7D1D-0CAB-216B}` · `Done`
- B11 (Send, no barangay): `No barangay on this phone yet` / `Counts are sent for a barangay. Ask the RHU to set up this phone for yours.`
- B12: `The camera paused` / `Keep this screen open and on for the whole minute.`
- B13: URGENT band line `Not fast for {1 to 4 years} (cut-off {40}), but {chest indrawing}.`
- B14: `Saved to the record`
- B15: `Couldn't save to the record. Try again.` · `Try again · Subukan ulit`
- B16: `Cry check off: {reason}.` · reasons `microphone not allowed` · `no microphone` · `the microphone didn't open` · `the cry check couldn't start` · `it was still loading when the count started` · `no sound was checked` · `part of the sound wasn't checked`
- B17: `No resident (just this check)`
- B18 (laptop pairing): `Pair a barangay phone` · `Scan the pairing QR on that phone's Send screen.` · `Compare this code with the phone's screen` · fingerprint · checkbox `The code matches the phone's screen` · primary `Pair this phone` · result `Paired: {Maligaya-D}` · lines `Read the pairing QR` · `Key {3109-7D1D-0CAB-216B}` · `Matched on the phone's screen` · `{Maligaya-D} can now send counts`
- B19: older export see 17h · already paired `{Maligaya-D} is already paired with this phone. Nothing changed.`
- B20 (laptop camera): `No camera found` · `This browser can't use the camera here` · `The camera didn't start` / `Close other apps that use the camera, then try again.` · fallback for all three `Choose a photo of the QR` · `Paste the QR text`
- B21 (18): older week under the time `Week {2026-W40}` · age-band detail headings `Under 2 months` · `2 to 11 months` · `1 to 4 years`
- B22: Priority pill on a tinted row (no new copy)
- B23: reason line `Why {Riverside-D} first: URGENT referrals ({1–4}), …`
- B24 (19 empty): `No reports yet` / `The plan appears when the first barangay QR comes in.` · primary `Scan a barangay QR`
- B25 (20 full text): `Approved plan · {Sat, Oct 10, 10:52 AM}` · `Approved by Municipal health officer` · Wording column `Written by the officer`
- B29 (PIN, phase 2 only): `Set a PIN` / `4 to 6 digits.` · `Enter it again` · `Enter your PIN` · `Your records are locked with your PIN on this phone.` · wrong `Wrong PIN. Try again in {30} s.` · `Forgot PIN` · sheet `Forgot your PIN?` / `The only way in is to erase every record on this phone. Counts already sent to the RHU are not affected.` · destructive `Erase this phone's records` · `Cancel` · hint `Sample data PIN: {2468}`

## Video, pitch and link previews

- og-image: `AgapayMo` · `Offline health checks for barangay health workers after a typhoon`
- Title card: `AgapayMo` · `When the typhoon takes the signal` · `Team Banana cue · AppBuildersPH Hackathon 2026`
- End card: `{live URL}` · `QR to the live app` (placeholder label) · `Works offline after one visit` · `The AI downloads once, inside the app.`

## Every live-region line (role="status")

- `Instructions from the RHU saved on this phone.` (1g)
- `Read {4} lines on this phone. Check the numbered fields.` (11b)
- `{Maligaya-D} received. {5} of 5 barangays in.` (16b, 17g)
- `Plan approved and saved to the log.` (19g)
- `Instructions saved on this phone.` (21a)
- `Checked {8:15 AM}` / `Referred {8:15 AM}` (B5 toast)
- `Paired: {Maligaya-D}` (B18)

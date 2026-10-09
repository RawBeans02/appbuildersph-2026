# Agapay copy deck, pass 1

Every string, by screen. Use word for word. `{x}` = filled by the app. Sample values are in brackets after the placeholder. Tagalog on main actions and results is part of the label, after a middle dot (·), in a lighter color. No em dashes; ranges use an en dash (–).

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
- Dose note: `Agapay never suggests a dose. Doxycycline is given only after consultation with a health professional (DOH).`
- Records error (any screen): `Couldn't open the records` / `Nothing was lost. Your records are still saved on this phone.` / `Still stuck? Close Agapay and open it again.`
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
- Options: `Under 2 months` `fast: 60+ /min` · `2 up to 12 months` `fast: 50+ /min` · `12 months up to 5 years` `fast: 40+ /min`
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
- 3c pre-permission: `Next, allow the camera and microphone` / `The camera counts breaths. The microphone listens for crying. Nothing is recorded, and nothing leaves this phone.` / `Continue`
- 3d blocked: `The camera is blocked` / `Hinga can't count without it. To allow it, open this site's settings in your browser and turn on Camera.` / primary `Count by hand with a timer` / link `I turned it on: try again`

## 4 · Hinga step 3 (counting)

- `Cancel` · countdown `{m:ss}` [0:42] `left`
- Headline: `Hold still` · `step 3 of 3`
- Trace label (screen readers): `Breathing trace`
- Mic line: `Listening for crying. Nothing is recorded.`

## 5 · Hinga refusals

- Top bar: `Count stopped`
- Under every message: `Nothing was saved.` · button `Try again · Subukan ulit`
- 5a `Crying detected` / `Wait until the child is calm, then count again. Crying changes the breathing rate.`
- 5b `Too much movement` / `Steady the phone. Rest your elbows on your knees or a table, and keep the chest inside the box.`
- 5c `Can't see the chest clearly` / `Move to brighter light or lift the shirt. Keep the whole chest inside the box.`
- 5d `Readings didn't agree` / `The phone counted two ways and got different numbers, so this count isn't safe to use.`

## 6 · Hinga result, fast

- Meta: `{Residente 010} · {HH-02} · {12 months up to 5 years} · {8:31 AM}` (no resident: `{12 months up to 5 years} · {8:31 AM}`)
- Band: `Fast breathing for age` · `{52}` `breaths a minute` · `The cut-off for {12 months up to 5 years} is {40}.`
- Headline: `I-refer ngayong araw` · `Refer to the midwife or RHU today.`
- Checklist title: `Check for danger signs` · `Tick any you see, or None of these. One tick makes this URGENT.` (after a tick: `{n} ticked`)
- Signs (the four WHO IMCI 2014 general danger signs first, then two severe signs): `Can't drink or breastfeed` · `Vomits everything (sumusuka ng lahat)` · `Convulsions (kombulsyon)` · `Very sleepy or hard to wake (lethargic or unconscious)` · `Chest pulls in when breathing in (chest indrawing)` · `Harsh noise when breathing in, while calm (stridor)` · then a separate row `None of these`. Save is enabled only after a tick or `None of these`.
- Primary: `Save to the record · I-save`
- 6b URGENT band: `Urgent · danger sign` · `{52}` `breaths a minute` · `Fast for {12 months up to 5 years} (cut-off {40}), and {chest indrawing}.`
- 6b headline: `I-refer agad` · `URGENT: bring the child to the RHU now. Don't wait for the next check.`
- 6b primary: `Save as URGENT · I-save`
- 6c saved: `Saved to {Residente 010}'s record` · `No danger signs ticked · {8:32 AM}` (or `{n} danger sign(s) ticked`) · primary `Done · Tapos na` · secondary `Check another child`
- Counted by hand (L8b result): add `Counted by hand` to the meta line.

## 7 · Hinga result, not fast

- Band: `Not fast breathing for age` · `{38}` `breaths a minute` · `The cut-off for {2 up to 12 months} is {50}.`
- Headline: `Hindi mabilis ang paghinga` · `Not fast breathing for this age.`
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
- Pills: `Expires within 6 weeks` · `Expired: set aside`
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
- Groups and rows: `Exposed, watch not started yet, by age` (`Under 2 months`, `2 up to 12 months`, `12 months up to 5 years`, `5 to 17 years`, `18 to 59 years`, `60 and over`) · `In the watch window now` · `Fast-breathing referrals, by age` (first three bands) · `URGENT referrals` · `Doxycycline capsules on hand` · `Of those, expiring within 6 weeks` · `Flags for clinician review`
- Footnote: `“<5” means 1 to 4. Small numbers are hidden so no household can be singled out.`
- Meta: `Export #{3} · signed on this phone`
- Primary: `Show the QR · Ipakita`
- 14b: `Show this to the municipal laptop` · code line `{SID-MAL} · {2026-W41} · #{3}` · `Hold the phone steady in front of the laptop's camera. Turn the brightness up if it doesn't scan.` · primary `Done, it was scanned · Tapos na` · link `What's in this QR` · image alt `QR code with this week's counts`
- 14c: `Marked as shared` · `Export #{3} for week {2026-W41}, shown at {9:05 AM}. Only the counts left this phone, and only as the QR.` · link `See what was shared` · primary `Back to Home`
- QR error: `Couldn't make the QR` / `Nothing was sent. Try again.` / `Try again · Subukan ulit`

## 15 / L10 · Privacy & AI

- Title: `Privacy & AI`
- `What runs on this phone`
  - `Breathing check (Hinga)` · `Uses the camera to count breaths. The video is never recorded or saved.`
  - `Crying check` · `Listens for crying during a count. Sound is never recorded.`
  - `Medicine-box reader` · `Reads the lot and expiry from a photo. The photo is deleted after reading.`
  - `Your records` · `Residents, floods, checks and stock stay in this phone's browser storage.`
- `What leaves this phone` · `Only the counts in the QR code, and only when you show it to the municipal laptop. No names, birthdays or addresses. Counts from 1 to 4 show as “<5”.` · link `See exactly what the QR holds`
- `What the AI can get wrong`
  - `It can miscount breaths if the child moves or cries, or the light is poor. When it can tell, it stops and says why.`
  - `It can misread a lot number or expiry. You check every field before anything is saved.`
  - `On the municipal laptop, AI drafts the plan's wording. The officer checks it before approving.`
- `Agapay never diagnoses and never suggests a dose. It counts, flags and refers.`
- Footer: `Research prototype, not a registered medical device. San Isidro Demo and every record in it are invented sample data.`

## Local AI states

- L1a: `Get Agapay ready for no signal` / `Download the AI once, so Agapay works without internet. After this, nothing you do needs a signal.`
  - Parts: `Breathing check (Hinga)` `Counts breaths with the camera` · `Crying check` `Hears if the child is crying` · `Medicine-box reader` `Reads the lot and expiry` · sizes `{15.2} MB`
  - `Total, one time` `{55.1} MB` · `Use Wi-Fi if you can. This phone has {2.1 GB} free.`
  - Primary `Download {55.1} MB · I-download` · link `Later`
- L1b: `Downloading the AI` / `So Agapay works without internet. Keep this screen open.` · `{1} of 3: {Breathing check}` · `{9.8} / {55.1} MB` · `{17}%` · row states `Downloading` `Waiting` `Done` · secondary `Cancel`
- L2: `Not enough space on this phone` · `Agapay needs` `{55.1} MB` · `Free now` `{21.4} MB` · `Free up about {34} MB, then check again. Deleting old videos or an app you don't use is usually enough.` · primary `Check again` · link `Use Agapay without the AI for now`
- L3: `Next, your browser may ask to keep Agapay's files` / `Tap Allow, so the AI isn't deleted when the phone runs low on space.` / `Continue`
- L4: `Getting the AI ready` / `Loading it into this phone's memory. This takes a few seconds.`
- L5: `Runs on this phone` / `The AI is saved on this phone and works with no signal. What you record stays here. Only counts leave, in the QR you choose to show.` · rows + `Ready` · link `What stays on this phone`
- L6a/b: `Reading the box` · `Finding the text` `step 1 of 2` · `Reading the text` `step 2 of 2` · `Reading on this phone. The photo is deleted after.` · `Cancel`
- L7: `Offline. Everything here still works.` / `Breathing checks, the watch list, stock and the QR all work with no signal. Only the first download and app updates need internet.` / `Got it`
- L8a: `This phone can't run the camera check` / `Its browser can't run the breathing AI. Updating Chrome or Safari may fix this.` · `You can still` · `Count breaths by hand with a timer` · `Keep the flood watch list` · `Add medicine stock by typing` · `Send the QR to the RHU` · primary `Count by hand with a timer`
- L8b: `Stop` · `{0:29}` `left` · `Count by hand` · `Watch the chest rise. Tap once for each breath.` · button `Tap for each breath` · `{12 months up to 5 years} · fast is {40} or more a minute`
- L9a: `The download stopped` / `The signal dropped at {9.8} of {55.1} MB. Connect to Wi-Fi or mobile data, then try again. What already downloaded is kept.` / `Try again · Subukan ulit`
- L9b: `The breathing check couldn't start` / `Its files are on this phone, but it didn't load. Closing other apps usually fixes this.` / `Try again · Subukan ulit` (other models: `The crying check couldn't start`, `The box reader couldn't start`)
- L9c: see screen 11.

## 16 · Municipal home (laptop)

- Nav: `Agapay` `Municipal view` · `San Isidro Demo · Sample data` · `Scan QR codes` · `Merged view` · `Plan` · `Approval log` · `Privacy & AI`
- Title: `Barangay reports` · `Week {2026-W41} · {Oct 5 to 11}`
- Panel: `Scan a barangay QR` · `The health worker shows the QR on their phone. Only counts come in: no names, birthdays or addresses.` · `The camera is off` · primary `Scan a barangay QR`
- List: `Received this week` `{2} of 5` · `{9:05 AM} · export #{3}` · pills `Received` `Waiting`
- Secondary: `Open the merged view ({2} of 5)`

## 17 · Scan (laptop)

- Title: `Scan a barangay QR` · `Week {2026-W41} · {2} of 5 received`
- `Looking for a QR` · `Hold the phone's QR inside the square, about a hand's length from the camera.` · secondary `Stop the camera`
- Success: `{Santo Niño-D} received` · `Week {2026-W41} · export #{4} · signed by the paired {Santo Niño-D} phone.` · `Ready for the next barangay.` · list `Just now` · secondary (narrow column) `Merged view ({3} of 5)`
- Already: `Already received` · `{Maligaya-D} export #{3} came in at {9:05 AM}. Nothing changed.`
- Invalid: `Not a valid Agapay QR` · `It isn't from a paired Agapay phone, so nothing was saved. Ask the health worker to open Send on Agapay.`
- Newer: `{Maligaya-D} updated` · `Export #{4} is newer, so it replaces #{3}.`
- Camera blocked: `The camera is blocked` · `Allow the camera for this site in the browser settings, then try again.` · `Try again`

## 18 · Merged view

- Title: `Merged view` · `Week {2026-W41} · {5} of 5 barangays · Sample data` · primary `Make the plan`
- Columns: `Barangay` · `Received` · `Exposed` · `In watch window` · `Fast-breathing referrals` · `Doxycycline on hand` · `Expiring in 6 weeks`
- Pill: `Priority` · total row `All 5 barangays` (fewer: `{3} of 5 barangays`) · waiting row `Waiting` with dashes
- Reason: `Why {Maligaya-D} first:` `the most residents in the watch window ({9}), fast-breathing referrals ({1–4}), and {30} of its {40} capsules expire within 6 weeks.`
- Footnote: `Ranges include counts sent as “<5” (1 to 4 people), which phones use to protect small households. No names, birthdays or addresses reach this laptop.`

## 19 · Plan

- Title: `Plan for week {2026-W41}` · `From {5} of 5 barangays · Sample data`
- `The plan` · `Made by fixed rules from the counts. Always available, with or without the AI.`
- Steps (rule output): `Send a doctor team to {Maligaya-D} first.` · `Move {60} capsules from {Bagong Silang-D} to {Maligaya-D}.` · `Use the {40} capsules that expire within 6 weeks first.` + their reason lines
- Note: `No doses. Doxycycline is given only after consultation with a health professional (DOH).`
- Panel title (all states): `Draft wording by the on-device AI: check before approving`
- Done: `Written on this laptop · {Qwen2.5 0.5B} · {6.2} s` · `All {6} numbers match the plan` · mismatch: `{1} number doesn't match the plan: {45}` · link `Write it again`
- Loading: `Downloading the writing AI` · `First time only. After this it runs on this laptop with no internet.` · `{412} / {879} MB · {46}%` · `The plan on the left works without it. You can approve now and skip the wording.` · secondary `Cancel the download`
- Drafting: `Writing on this laptop` · `Writing from the plan's numbers…` · secondary `Stop`
- Off: `The writing AI is off on this laptop` · `This laptop can't run it. The plan still works: approve it as listed, or write the wording yourself.` · placeholder `Write the wording (optional)`
- Approve bar: `Approved by` · `Municipal health officer` · primary `Approve plan`
- Toast after: `Plan approved and saved to the log.`

## 20 · Approval log

- Title: `Approval log` · `Kept on this laptop only · Sample data`
- Columns: `When` · `Approved by` · `Plan` · `From` · `Wording`
- Values: `{5} of 5 barangays` · wording `AI draft` / `AI draft, edited` / `Rules only`
- Empty: `No plans approved yet. Approved plans show here.`

## 404

- `404` · `Walang ganitong page.` · `This page isn't part of Agapay. Your records are safe on this phone.` · primary `Go to Home · Bumalik sa Home` (laptop: `Go to the municipal home`)
- Page title: `Page not found · Agapay`

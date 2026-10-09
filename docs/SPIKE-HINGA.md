# Hinga spike (S1): phone test protocol and results

This throwaway spike decides whether Hinga, the camera breathing-rate check, can be built on a pose-tracked torso region. The kill call is at 7:00 PM (`TASKS.md`, decision points). The page is https://appbuildersph-2026.vercel.app/spike-hinga.html (not linked from the app).

## What the spike does
1. The rear camera (about 640x480) films the person's upper body. MediaPipe Pose Landmarker lite (VIDEO mode, CPU, on the device) finds the shoulders and hips; their box is the torso region.
2. For 60 s, two signals are taken from each frame: the mean brightness inside the torso box (locked at the start of the count) and the height of the shoulder midpoint.
3. `src/spikes/hinga/dsp.ts` resamples both to 10 Hz, removes the trend, band-passes 0.2 to 1.7 Hz (12 to 102 breaths/min), takes the spectral peak over sliding 30 s windows and checks it against a zero-crossing count over the whole minute. It uses the signal with the clearer peak.
4. It refuses instead of guessing when the recording is too short or paused, the torso is lost in more than 20% of frames, the torso box moves, there is no clear rhythm, or the two counts (or the 30 s windows) disagree.
5. A count is compared with the WHO IMCI 2014 fast-breathing cut-off for the age entered: "Fast breathing for age: refer" or "Not fast breathing for age". It is a breathing-rate check, never a diagnosis.

The page also shows, measured on the phone: the model load time, the average pose inference time per frame and the effective frame rate. Its Report block collects everything for the table below.

## Kill criterion
Within ±3/min of a 45/min metronome-paced breath, so a count from **42 to 48**, on **at least 4 of 5 trials**, on **one iPhone and one Android**, in **airplane mode after one online load**. A refusal counts as a failed trial; record its reason.

## Before the trials (once per phone)
1. Online, open the page (Safari on the iPhone, Chrome on Android).
2. Wait for "Offline app shell: ready".
3. Tap **Download for offline (17.5 MB)** and wait for "Offline files saved on this device".
4. Wait for "Pose model ready".
5. Turn on airplane mode with Wi-Fi off. Reload the page. Check that all three come back: the app shell is ready, the offline files are saved, the pose model is ready. If the page or the model doesn't load offline, record that and stop: the spike fails its offline requirement on that phone.
6. iPhone: set the ring/silent switch to ring and turn the volume up. The page asks Safari to play through the switch (the Audio Session API), but older Safari versions ignore that.

## Setup for every trial
- **Who:** one of us, an adult, sitting upright and still, facing the phone. Test only on ourselves; never on patients or children for this spike. Wear the same top for all trials and note it.
- **Safety:** 45 breaths a minute is fast for an adult. Breathe shallowly, stay seated, rest at least 2 minutes between trials, and stop if you feel dizzy or tingly.
- **Framing:** the head, shoulders and chest in view (the pose model's card lists a head that isn't visible as out of scope), only one person in the frame, even light, no bright window behind the person. Rest the phone on a table, a stack of books or a stand if you can; otherwise hold it with both hands, elbows braced.
- **Metronome:** set 45, keep Sound on, tap **Start metronome** at least 15 s before the count. Breathe in on the high beep and out on the low beep. The person faces the back of the phone, so they follow the sound, not the bar.
- **Age field:** leave it at 24 months (cut-off 40/min). It doesn't change the count; a correct 45 reads "Fast breathing for age: refer".

## Running a trial
1. Tap **Start camera** and allow the camera (Safari may ask again after a reload).
2. Wait for the green box on the torso and "Torso found".
3. With the metronome running, tap **Start 60 s count**. Don't touch or move the phone for the minute. Keep the screen on: a locked screen or a hidden page cancels the count.
4. Read the result: a count with the age verdict, or "No count" with the reason.
5. Copy the Report block (long-press, Select All, Copy) into the team chat, then fill in a row below. A trial passes when the count is 42 to 48.

## Extra checks (not part of the kill criterion; once per phone if there's time)
- **Motion:** during a count, slowly pan the phone sideways. Expected: "Too much movement".
- **No person:** point the camera at an empty chair. Expected: no green box, and Start 60 s count stays disabled.
- **Normal breathing:** no metronome; one of us counts the breaths by watching for the same minute. Compare that count with the page's.

## Results
Fill in from each trial's Report block. "Prominence" is the chosen signal's; "Peak / crossings" are its two counts.

### iPhone: _model, iOS version, Safari version_
| Trial | Airplane mode | Result (/min, or the refusal) | Pass (42 to 48) | Signal used | Prominence | Peak / crossings (/min) | Torso lost / moved (%) | Model load (ms) | Pose inference (ms/frame) | Frame rate (fps) | Notes (framing, light, held or rested) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | |
| 2 | | | | | | | | | | | |
| 3 | | | | | | | | | | | |
| 4 | | | | | | | | | | | |
| 5 | | | | | | | | | | | |

Passes: _ of 5

### Android: _model, Android version, Chrome version_
| Trial | Airplane mode | Result (/min, or the refusal) | Pass (42 to 48) | Signal used | Prominence | Peak / crossings (/min) | Torso lost / moved (%) | Model load (ms) | Pose inference (ms/frame) | Frame rate (fps) | Notes (framing, light, held or rested) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | |
| 2 | | | | | | | | | | | |
| 3 | | | | | | | | | | | |
| 4 | | | | | | | | | | | |
| 5 | | | | | | | | | | | |

Passes: _ of 5

### Kill call
iPhone _ of 5 · Android _ of 5 · Decision: _go, or fallback 1, or fallback 2_ · Who and when: _

## Settings to tune
All in `src/spikes/hinga/dsp.ts`. They are first settings: the noise thresholds were set against synthetic noise in the unit tests (`dsp.test.ts`), not on phones. Any change must keep those tests passing; white noise and random-walk noise must still refuse.

| Setting | Now | Look at |
|---|---|---|
| `MIN_PROMINENCE` | 0.6 | Trials refused with "no clear breathing rhythm" although the trace clearly shows the breathing: note the prominence values |
| `AGREEMENT_PER_MIN`, `MAX_WINDOW_SPREAD_PER_MIN` | 3, 6 | Trials refused with "the two ways of counting disagree": compare the peak, the crossings and the 30 s window peaks |
| `MAX_LOST_FRACTION` | 0.2 | "Couldn't find the chest": the torso lost % |
| `MOVE_LIMIT`, `SCALE_LIMIT`, `MAX_MOVED_FRACTION` | 0.15, 0.25, 0.1 | "Too much movement" on a phone that was resting still: the moved % and the largest shift |
| Band, resampling, windows | 0.2 to 1.7 Hz, 10 Hz, 30 s every 5 s | Only if the counts are off while the trace looks clean |

## Fallback plan
If the pose-based region fails the kill criterion (the torso isn't found reliably, or the counts miss):

1. **Tap-to-select chest region with frame differencing.** The health worker taps the chest on the live video; a fixed box around the tap becomes the region, so no pose model is needed (a smaller download, and no "head in view" requirement). Each frame, the box's row-brightness profile is compared with the previous frame's to find the vertical shift that best aligns them; summing those shifts gives a signed chest-displacement trace. The same `dsp.ts` chain then runs unchanged on it: `analyze()` works on any per-frame signal, so the band-pass, the FFT peak, the zero-crossing check and the refusals carry over. The motion gate uses the difference outside the box (the whole scene moving means the camera moved) instead of the torso box. Unsigned motion energy (the mean absolute difference between frames) is simpler but peaks twice per breath, so its rate would have to be halved; the signed shift avoids that.
2. **If that fails too:** the guided tap counter. The health worker taps once per breath for 60 s while the app times the minute and shows the count against the same IMCI cut-offs.

## Known risks to watch
- **The pose model's limits:** its model card lists a head that isn't visible as out of scope and says it is not intended for life-critical decisions. Hinga uses it only to find the torso; the count and the refusals are our own signal processing. Children aren't tested in this spike.
- **Main thread:** the spike runs pose inference on the main thread, the simplest setup to get running on phones. Hinga in the app (B2) should move it into a worker (`QUALITY.md`: inference off the main thread); check MediaPipe's module-worker build (`vision_wasm_module_internal`) there first.
- **iPhone:** the camera prompt can come back after a reload; a locked screen stops the camera; the silent switch can mute the metronome where Safari ignores the Audio Session API.
- **Light and clothing:** low light or a backlit window weakens the brightness signal and makes the landmarks jitter; loose clothing hides chest movement.
- **Held phone:** hand shake may trip the motion gate. Resting the phone is the realistic setup for a calm child anyway; note "held or rested" in every row.
- **Download size:** the offline download is 17,534,700 bytes (the SIMD WebAssembly build and the model). The page and its loader script also add 485.88 KiB to every visitor's first-visit precache (`README.md`, What requires internet).

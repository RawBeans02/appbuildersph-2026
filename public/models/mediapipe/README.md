# MediaPipe Pose Landmarker (lite), for the Hinga spike

An unmodified third-party file, redistributed under the Apache License 2.0 (copy in `LICENSE-APACHE-2.0.txt`). The model is by Google (MediaPipe BlazePose GHUM 3D; its model card states the Apache License 2.0).

| File | What it is | Bytes | SHA-256 | Downloaded from |
|---|---|---|---|---|
| `pose_landmarker_lite.task` | MediaPipe Pose Landmarker, lite, float16: a zip of `pose_detector.tflite` and `pose_landmarks_detector.tflite` | 5,777,746 | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task |

The download's MD5 (`04a75ddf7c811ac7a1a4523266dd7d88`) matches the `x-goog-hash` that Google Cloud Storage reports for that URL. The `float16/latest/` URL listed in the MediaPipe docs served the same file (same MD5) on Oct 9, 2026.

- Model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf
- Docs: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker

The model card lists a head that isn't visible as out of scope, and says the model is not intended for life-critical decisions. Hinga uses it only to find the torso; the breathing count comes from our own signal processing, and the result is a "fast breathing for age" check, never a diagnosis.

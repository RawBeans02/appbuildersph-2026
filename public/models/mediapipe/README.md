# MediaPipe models for Hinga: Pose Landmarker (lite) and YAMNet

Unmodified third-party files, redistributed under the Apache License 2.0 (copy in `LICENSE-APACHE-2.0.txt`). The pose model is by Google (MediaPipe BlazePose GHUM 3D; its model card states the Apache License 2.0). YAMNet is by Google, from tensorflow/models `research/audioset/yamnet`, whose repository LICENSE puts `research/` under the Apache License 2.0; this is MediaPipe's TFLite build of it, with its 521 class names embedded.

| File | What it is | Bytes | SHA-256 | Downloaded from |
|---|---|---|---|---|
| `pose_landmarker_lite.task` | MediaPipe Pose Landmarker, lite, float16: a zip of `pose_detector.tflite` and `pose_landmarks_detector.tflite` | 5,777,746 | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task |
| `yamnet.tflite` | YAMNet audio event classifier, float32, MediaPipe build (Hinga's cry check uses "Crying, sobbing" and "Baby cry, infant cry", indices 19 and 20) | 4,126,810 | `4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf` | https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite |

Each download's MD5 matches the `x-goog-hash` that Google Cloud Storage reports for its URL (pose `04a75ddf7c811ac7a1a4523266dd7d88`, YAMNet `d02e1b838813107817b755d09d6b56b3`). The `latest/` URLs listed in the MediaPipe docs served the same files (same MD5) on Oct 9, 2026.

- Model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf
- Docs: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker and https://developers.google.com/edge/mediapipe/solutions/audio/audio_classifier
- YAMNet source and class map: https://github.com/tensorflow/models/tree/master/research/audioset/yamnet

The model card lists a head that isn't visible as out of scope, and says the model is not intended for life-critical decisions. Hinga uses it only to find the torso; the breathing count comes from our own signal processing, and the result is a "fast breathing for age" check, never a diagnosis.

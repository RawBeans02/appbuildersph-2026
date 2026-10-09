# PP-OCRv5 mobile models (OCR spike)

Unmodified third-party files, redistributed under the Apache License 2.0 (copy in `LICENSE-APACHE-2.0.txt`). PaddleOCR and its models are by the PaddlePaddle Authors.

| File | What it is | Bytes | SHA-256 | Downloaded from (pinned revision) | Original model |
|---|---|---|---|---|---|
| `det.onnx` | PP-OCRv5_mobile_det, text detection, ONNX export | 4,826,518 | `1eb7b4f7ab657ebd1c66d5f79bca7497f29768a2e3c15e52daecbba1a8e4a039` | huggingface.co/ilaylow/PP_OCRv5_mobile_onnx, `ppocrv5_det.onnx` @ `f97b337b3ac256f9dffcac5fc53955082d919d58` (Apache-2.0) | huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det (Apache-2.0) |
| `rec-en.onnx` | en_PP-OCRv5_mobile_rec, English text recognition, ONNX export | 7,830,888 | `4e16deb22c4da6468bdca539b2cd3c8687825538b67109177c47d359ab994cd7` | huggingface.co/monkt/paddleocr-onnx, `languages/english/rec.onnx` @ `7b02d0a30a07ba2b92ad1ff5a8941ae2c633de65` (Apache-2.0) | huggingface.co/PaddlePaddle/en_PP-OCRv5_mobile_rec (Apache-2.0) |
| `dict-en.txt` | The recognizer's 436-character dictionary | 1,416 | `e025a66d31f327ba0c232e03f407ae8d105e1e709e7ccb3f408aa778c24e70d6` | monkt/paddleocr-onnx, `languages/english/dict.txt` @ the same revision | Identical to the `character_dict` in PaddlePaddle/en_PP-OCRv5_mobile_rec's `inference.yml` (checked line by line) |

The SHA-256 of both `.onnx` files matches the Hugging Face LFS checksums of the pinned revisions.

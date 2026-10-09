import type { ModelRecord } from '@mlc-ai/web-llm'

// The local model that rewords the municipal plan: Qwen2.5-0.5B-Instruct
// (Apache-2.0), WebLLM's prebuilt 4-bit builds. The f16 build needs the
// adapter's shader-f16 feature; without it, the f32 build. One constant to
// change the model.
export const WORDING_MODEL = {
  f16: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  f32: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
} as const

// The model's name as the panel shows it ("Written on this laptop · …").
export const WORDING_MODEL_NAME = 'Qwen2.5 0.5B'

// These are the two Qwen records from @mlc-ai/web-llm 0.2.85's
// prebuiltAppConfig. Keeping the exact records here lets the worker load the
// same model URLs that the main thread checks for offline readiness, without
// importing WebLLM into the main-thread bundle.
export const WORDING_MODEL_RECORDS = {
  f16: {
    model: 'https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    model_id: WORDING_MODEL.f16,
    model_lib:
      'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm',
    vram_required_MB: 944.62,
    low_resource_required: true,
    overrides: { context_window_size: 4096 },
  },
  f32: {
    model: 'https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
    model_id: WORDING_MODEL.f32,
    model_lib:
      'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen2-0.5B-Instruct-q4f32_1_cs1k-webgpu.wasm',
    vram_required_MB: 1060.2,
    low_resource_required: true,
    overrides: { context_window_size: 4096 },
  },
} satisfies Record<keyof typeof WORDING_MODEL, ModelRecord>

export type WordingModelRecord = (typeof WORDING_MODEL_RECORDS)[keyof typeof WORDING_MODEL_RECORDS]

export function wordingModelId(shaderF16: boolean): string {
  return shaderF16 ? WORDING_MODEL.f16 : WORDING_MODEL.f32
}

export function wordingModelRecord(shaderF16: boolean): WordingModelRecord {
  return shaderF16 ? WORDING_MODEL_RECORDS.f16 : WORDING_MODEL_RECORDS.f32
}

// The local model that rewords the municipal plan: Qwen2.5-0.5B-Instruct
// (Apache-2.0), WebLLM's prebuilt 4-bit builds. The f16 build needs the
// adapter's shader-f16 feature; without it, the f32 build. One constant to
// change the model.
export const WORDING_MODEL = {
  f16: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  f32: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
} as const

export function wordingModelId(shaderF16: boolean): string {
  return shaderF16 ? WORDING_MODEL.f16 : WORDING_MODEL.f32
}

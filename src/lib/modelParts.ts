import type { OfflineModel } from './offlineModels'

// The three parts of the on-device AI as the health worker sees them (design
// L1a, L1b, L5), and which registered models make up each. Every phone model
// must belong to a part (modelParts.test.ts).

export type ModelPart = {
  key: 'hinga' | 'cry' | 'ocr'
  title: string
  short: string
  description: string
  ids: string[]
}

export const MODEL_PARTS: ModelPart[] = [
  {
    key: 'hinga',
    title: 'Breathing check (Hinga)',
    short: 'Breathing check',
    description: 'Counts breaths with the camera',
    ids: ['mediapipe-tasks-vision-module', 'pose-landmarker-lite'],
  },
  {
    key: 'cry',
    title: 'Crying check',
    short: 'Crying check',
    description: 'Hears if the child is crying',
    ids: ['mediapipe-tasks-audio-module', 'yamnet'],
  },
  {
    key: 'ocr',
    title: 'Medicine-box reader',
    short: 'Medicine-box reader',
    description: 'Reads the lot and expiry',
    ids: ['onnxruntime-web-wasm', 'pp-ocrv5-mobile-en', 'tesseract-js-eng'],
  },
]

export type PartWithModels = ModelPart & { models: OfflineModel[] }

// The parts that have models on this device, in download order.
export function partsWithModels(models: readonly OfflineModel[]): PartWithModels[] {
  return MODEL_PARTS.map((part) => ({ ...part, models: models.filter((model) => part.ids.includes(model.id)) })).filter(
    (part) => part.models.length > 0,
  )
}

export function partOf(modelId: string): ModelPart | null {
  return MODEL_PARTS.find((part) => part.ids.includes(modelId)) ?? null
}

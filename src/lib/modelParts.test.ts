import { describe, expect, it } from 'vitest'
import { MODEL_PARTS, partOf, partsWithModels } from './modelParts'
import { offlineModels, type OfflineModel } from './offlineModels'

describe('model parts', () => {
  it('puts every registered phone model in a part', () => {
    const orphans = offlineModels.filter((model) => model.device === 'phone' && !partOf(model.id))
    expect(orphans.map((model) => model.id)).toEqual([])
  })

  it('groups models into parts in download order, skipping empty parts', () => {
    const model = (id: string): OfflineModel => ({ id, version: '1', label: id, device: 'phone', files: [] })
    const parts = partsWithModels([model('yamnet'), model('pp-ocrv5-mobile-en'), model('onnxruntime-web-wasm')])
    expect(parts.map((part) => [part.key, part.models.map((m) => m.id)])).toEqual([
      ['cry', ['yamnet']],
      ['ocr', ['pp-ocrv5-mobile-en', 'onnxruntime-web-wasm']],
    ])
    expect(MODEL_PARTS.map((part) => part.title)).toEqual(['Breathing check (Hinga)', 'Crying check', 'Medicine-box reader'])
  })
})

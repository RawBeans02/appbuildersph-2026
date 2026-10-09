import { describe, expect, it } from 'vitest'
import { collectOfflineModels, modelBytes, type OfflineModel } from './offlineModels'

const model = (id: string, bytes = 10): OfflineModel => ({
  id,
  version: '1',
  label: id,
  device: 'phone',
  files: [{ url: `/models/${id}.bin`, bytes }],
})

describe('collectOfflineModels', () => {
  it('collects every registered model and counts a shared one once', () => {
    const models = collectOfflineModels({
      'a/models.ts': { models: [model('runtime'), model('ocr')] },
      'b/models.ts': { models: [model('runtime'), model('pose')] },
      'c/models.ts': {},
    })
    expect(models.map((m) => m.id)).toEqual(['runtime', 'ocr', 'pose'])
    expect(modelBytes(models)).toBe(30)
  })

  it('refuses one model registered with different files', () => {
    expect(() =>
      collectOfflineModels({ 'a/models.ts': { models: [model('runtime', 10)] }, 'b/models.ts': { models: [model('runtime', 11)] } }),
    ).toThrow(/registered twice/)
  })
})

import type { ModelSpec } from './modelCache'

// Every model (and runtime .wasm) the "Prepare for offline" step downloads.
// A feature registers its models by adding a models.ts anywhere under src/
// that exports `models: OfflineModel[]`; it's found with import.meta.glob.
// The same model registered by two features (a shared runtime) counts once.

export type OfflineModel = ModelSpec & {
  label: string
  device: 'phone' | 'laptop'
}

export function collectOfflineModels(modules: Record<string, { models?: OfflineModel[] }>): OfflineModel[] {
  const byKey = new Map<string, OfflineModel>()
  for (const [file, module] of Object.entries(modules)) {
    for (const model of module.models ?? []) {
      const key = `${model.id}@${model.version}`
      const existing = byKey.get(key)
      if (existing && JSON.stringify(existing.files) !== JSON.stringify(model.files)) {
        throw new Error(`${key} is registered twice with different files (again in ${file}).`)
      }
      byKey.set(key, model)
    }
  }
  return [...byKey.values()]
}

export const offlineModels = collectOfflineModels(
  import.meta.glob<{ models?: OfflineModel[] }>('../**/models.ts', { eager: true }),
)

export const modelBytes = (models: ModelSpec[]) =>
  models.reduce((sum, model) => sum + model.files.reduce((s, file) => s + file.bytes, 0), 0)

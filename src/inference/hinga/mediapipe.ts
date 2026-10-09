import { loadModelFile, type ModelSpec } from '../../lib/modelCache'

// A MediaPipe WasmFileset built from the model cache rather than from URLs,
// so a task starts offline in a worker or on the main thread alike, without
// depending on the service worker seeing the request.
//
// MediaPipe's ES-module loader (the .mjs in public/models/mediapipe-runtime/)
// sets globalThis.ModuleFactory when imported; with an empty wasmLoaderPath,
// tasks-vision and tasks-audio skip their own loading step (a <script> tag on
// the main thread, importScripts() in a worker, neither of which can load an ES
// module) and use that factory. The .wasm is handed over as a blob URL.

// Structurally MediaPipe's WasmFileset, which the packages don't export.
export type Fileset = { wasmLoaderPath: string; wasmBinaryPath: string }

type FactoryScope = { ModuleFactory?: unknown }

// runtime.files: the loader (.mjs) first, then the .wasm. Call release() once
// the task is created. Not safe to run twice at once in one scope (both share
// globalThis.ModuleFactory), so create tasks one after another.
export async function filesetFromCache(runtime: ModelSpec): Promise<{ fileset: Fileset; release(): void }> {
  const [loaderFile, wasmFile] = runtime.files
  const [loader, wasm] = await Promise.all([loadModelFile(runtime, loaderFile), loadModelFile(runtime, wasmFile)])
  const loaderUrl = URL.createObjectURL(new Blob([loader], { type: 'text/javascript' }))
  const wasmUrl = URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }))
  const release = () => {
    URL.revokeObjectURL(loaderUrl)
    URL.revokeObjectURL(wasmUrl)
  }
  try {
    const module = (await import(/* @vite-ignore */ loaderUrl)) as { default?: unknown }
    // MediaPipe clears ModuleFactory after each task it creates; set it again.
    ;(globalThis as FactoryScope).ModuleFactory = module.default
  } catch (error) {
    release()
    throw error
  }
  return { fileset: { wasmLoaderPath: '', wasmBinaryPath: wasmUrl }, release }
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

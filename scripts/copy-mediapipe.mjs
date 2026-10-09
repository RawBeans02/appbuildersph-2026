// Copies MediaPipe's WebAssembly runtimes from node_modules into public/
// (both targets gitignored), so the site serves them itself and never loads
// them from a CDN. Runs before `npm run dev` and `npm run build`.
import { copyFileSync, mkdirSync } from 'node:fs'

const copies = [
  // The Hinga spike page (spike-hinga.html): the classic SIMD build, on the main thread.
  ['@mediapipe/tasks-vision/wasm/vision_wasm_internal.js', 'mediapipe/wasm/vision_wasm_internal.js'],
  ['@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm', 'mediapipe/wasm/vision_wasm_internal.wasm'],
  // The app (src/inference/hinga/): the ES-module builds, which also run in a
  // module worker. "Prepare for offline" downloads them with the models, so
  // they live under /models/ (the service worker serves that path from the
  // model caches) and the loaders are renamed .mjs (the app-shell precache
  // takes *.js; these belong to the offline download, not the shell).
  ['@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js', 'models/mediapipe-runtime/vision_wasm_module_internal.mjs'],
  ['@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.wasm', 'models/mediapipe-runtime/vision_wasm_module_internal.wasm'],
  ['@mediapipe/tasks-audio/wasm/audio_wasm_module_internal.js', 'models/mediapipe-runtime/audio_wasm_module_internal.mjs'],
  ['@mediapipe/tasks-audio/wasm/audio_wasm_module_internal.wasm', 'models/mediapipe-runtime/audio_wasm_module_internal.wasm'],
]

for (const [from, to] of copies) {
  const target = new URL(`../public/${to}`, import.meta.url)
  mkdirSync(new URL('.', target), { recursive: true })
  copyFileSync(new URL(`../node_modules/${from}`, import.meta.url), target)
}

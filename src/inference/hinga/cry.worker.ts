import type { AudioClassifier } from '@mediapipe/tasks-audio'
import { classifyCry, createCryClassifier } from './cryRuntime'
import { errorText } from './mediapipe'
import type { CryRequest, CryResponse, WorkerScope } from './protocol'

// Hinga's cry-check worker: YAMNet scores each piece of microphone audio for
// crying, and the audio is dropped right after. Started by cryChecker.ts.

const scope = self as unknown as WorkerScope<CryRequest, CryResponse>
let classifier: AudioClassifier | null = null

scope.onmessage = async ({ data: message }) => {
  if (message.type === 'init') {
    try {
      classifier ??= await createCryClassifier()
      scope.postMessage({ type: 'ready' })
    } catch (error) {
      scope.postMessage({ type: 'init-error', message: errorText(error) })
    }
    return
  }
  try {
    if (!classifier) throw new Error('The cry model is not loaded.')
    scope.postMessage({ type: 'scores', id: message.id, windows: classifyCry(classifier, message.samples, message.sampleRate) })
  } catch (error) {
    scope.postMessage({ type: 'classify-error', id: message.id, message: errorText(error) })
  }
}

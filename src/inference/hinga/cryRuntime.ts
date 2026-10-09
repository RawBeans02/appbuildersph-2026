import { AudioClassifier } from '@mediapipe/tasks-audio'
import { loadModelFile } from '../../lib/modelCache'
import { CRY_LABELS, cryScore, type CryWindow } from './cry'
import { filesetFromCache } from './mediapipe'
import { AUDIO_RUNTIME, CRY_MODEL } from './models'

// YAMNet on MediaPipe's audio classifier, kept to the two crying classes.
// Used by cry.worker.ts.

export async function createCryClassifier(): Promise<AudioClassifier> {
  const { fileset, release } = await filesetFromCache(AUDIO_RUNTIME)
  try {
    const model = new Uint8Array(await loadModelFile(CRY_MODEL, CRY_MODEL.files[0]))
    return await AudioClassifier.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
      maxResults: -1,
      categoryAllowlist: [...CRY_LABELS],
    })
  } finally {
    release()
  }
}

// One piece of microphone audio in, one crying score per YAMNet window out.
export function classifyCry(classifier: AudioClassifier, samples: Float32Array, sampleRate: number): CryWindow[] {
  const results = classifier.classify(samples, sampleRate)
  const durationS = samples.length / sampleRate / Math.max(1, results.length)
  return results.map((result) => ({ durationS, score: cryScore(result.classifications[0]?.categories ?? []) }))
}

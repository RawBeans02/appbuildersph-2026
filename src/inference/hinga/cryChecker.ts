import type { CryWindow } from './cry'
import type { CryResponse } from './protocol'
import { startWorker, type WorkerClient } from './workerClient'

// The cry check: YAMNet in a worker (cry.worker.ts) plus the microphone, used
// only during the 60 s count. The audio goes to the worker in ~1 s pieces
// (transferred, so the page keeps no copy) and is dropped after scoring;
// nothing is recorded, stored or sent.

type Scores = Extract<CryResponse, { type: 'scores' }>

export type CryModel = { client: WorkerClient<Scores>; dispose(): void }

export async function startCryModel(): Promise<CryModel> {
  const worker = new Worker(new URL('./cry.worker.ts', import.meta.url), { type: 'module' })
  try {
    const client = await startWorker<Scores>(worker)
    return { client, dispose: () => client.terminate() }
  } catch (error) {
    worker.terminate()
    throw error
  }
}

export type Listening = {
  // Seconds of audio scored so far, and the windows' crying scores.
  windows(): CryWindow[]
  stop(): void
}

// Call from the user's tap (the start of the count): browsers only start audio
// from a gesture, so the AudioContext is made before the first await.
// Rejects when the microphone is refused or missing.
export async function listenForCrying(model: CryModel, onWindow: () => void): Promise<Listening> {
  const context = new AudioContext()
  void context.resume()
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      video: false,
    })
  } catch (error) {
    void context.close()
    throw error
  }

  const windows: CryWindow[] = []
  const source = context.createMediaStreamSource(stream)
  // ScriptProcessorNode is deprecated but works everywhere, iPhone included,
  // without a separate worklet file; its output stays silent.
  const processor = context.createScriptProcessor(4096, 1, 1)
  const pieceLength = Math.round(context.sampleRate)
  let piece = new Float32Array(pieceLength)
  let filled = 0
  let stopped = false

  processor.onaudioprocess = (event) => {
    if (stopped) return
    const input = event.inputBuffer.getChannelData(0)
    let offset = 0
    while (offset < input.length) {
      const take = Math.min(input.length - offset, pieceLength - filled)
      piece.set(input.subarray(offset, offset + take), filled)
      filled += take
      offset += take
      if (filled === pieceLength) {
        const samples = piece
        piece = new Float32Array(pieceLength)
        filled = 0
        model.client
          .request({ type: 'classify', samples, sampleRate: context.sampleRate }, 'scores', [samples.buffer])
          .then((answer) => {
            if (stopped) return
            windows.push(...answer.windows)
            onWindow()
          })
          .catch(() => {})
      }
    }
  }
  source.connect(processor)
  processor.connect(context.destination)

  return {
    windows: () => windows,
    stop() {
      stopped = true
      processor.onaudioprocess = null
      source.disconnect()
      processor.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    },
  }
}

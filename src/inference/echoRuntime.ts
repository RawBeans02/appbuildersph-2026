import type { Runtime } from './protocol'

// A TEST FAKE, not AI: it runs no model. run() streams its text input back
// word by word and returns it unchanged. It exists so the worker plumbing can
// be tested, and the UI wired, before the real on-device runtime is picked.
// Never present its output as a model's answer.

export type EchoRuntimeOptions = {
  // Pause between steps, to watch progress in the UI. The default 0 awaits a
  // microtask instead of a timer, which keeps tests deterministic.
  stepMs?: number
}

export function createEchoRuntime({ stepMs = 0 }: EchoRuntimeOptions = {}): Runtime<string, string> {
  const step = () =>
    stepMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, stepMs)) : Promise.resolve()

  return {
    async init(_backend, onProgress) {
      await step()
      onProgress(0.5)
      await step()
      onProgress(1)
    },

    async run(input, { signal, onProgress }) {
      // Requests arrive untyped through postMessage.
      if (typeof input !== 'string') throw new TypeError('The echo runtime only takes text.')
      // Each word keeps its trailing whitespace, so the partials join back into the input.
      const words = input.match(/\S+\s*|\s+/g) ?? ['']
      for (const [index, word] of words.entries()) {
        await step()
        signal.throwIfAborted()
        onProgress((index + 1) / words.length, word)
      }
      return input
    },
  }
}

export const echoRuntime = createEchoRuntime()

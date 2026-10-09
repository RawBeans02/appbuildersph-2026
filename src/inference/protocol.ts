import type { Backend } from '../lib/backend'

// The messages between the main thread (client.ts) and the inference worker
// (inference.worker.ts). Types only, shared by both sides.
//
// Every request carries a numeric id, and every response names the id of the
// request it answers. Each init and run ends with exactly one final response
// ('ready', 'result' or 'error'), after any number of 'progress' messages.
// A cancel gets no reply of its own: the run it cancels ends with 'cancelled'.

export type WorkerRequest =
  | { type: 'init'; id: number; backend: Backend }
  | { type: 'run'; id: number; input: unknown }
  // runId is the id of the run request to cancel.
  | { type: 'cancel'; id: number; runId: number }

export type WorkerResponse =
  | { type: 'ready'; id: number }
  // progress runs 0..1. partial is runtime-defined, e.g. the newly streamed text.
  | { type: 'progress'; id: number; progress: number; partial?: unknown }
  | { type: 'result'; id: number; output: unknown }
  | { type: 'error'; id: number; code: InferenceErrorCode; message: string }

export type InferenceErrorCode =
  // A run came before a successful init (or after a failed one).
  | 'not-ready'
  | 'init-failed'
  | 'run-failed'
  | 'cancelled'
  // A message the worker can't read, or a request that can't be sent.
  | 'bad-request'

export type RunContext = {
  // Aborted when the run is cancelled. Stop at the next safe point and reject.
  signal: AbortSignal
  onProgress: (progress: number, partial?: unknown) => void
}

// One on-device model runtime (WebLLM, ONNX Runtime Web, Transformers.js...).
// The worker calls init before any run (again to retry or switch backend), and
// never calls init or run while another is in flight. Inputs come from
// postMessage, so run() should check its input, and its output must survive
// structured cloning.
export type Runtime<Input = unknown, Output = unknown> = {
  // partial: runtime-defined detail, e.g. how many MB of weights are fetched.
  init(backend: Backend, onProgress: (progress: number, partial?: unknown) => void): Promise<void>
  run(input: Input, context: RunContext): Promise<Output>
}

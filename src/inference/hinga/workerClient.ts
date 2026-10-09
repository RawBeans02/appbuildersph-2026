// A small promise wrapper for Hinga's workers: start one, wait for 'ready',
// then send requests by id and settle each on its answer. Kept apart from the
// workers so it can be tested with a fake.

export type WorkerLike = {
  postMessage(message: unknown, transfer?: Transferable[]): void
  addEventListener(type: 'message' | 'error', listener: (event: Event) => void): void
  terminate(): void
}

type Answer = { type: string; id?: number; message?: string }

export type WorkerClient<Result> = {
  // Sends a request with a fresh id; resolves with the answer of `resultType`.
  request(message: Record<string, unknown>, resultType: string, transfer?: Transferable[]): Promise<Result>
  terminate(): void
}

// Resolves once the worker answers 'ready' to 'init'; rejects on 'init-error'
// or when the worker script fails to load.
export function startWorker<Result>(worker: WorkerLike): Promise<WorkerClient<Result>> {
  let nextId = 1
  let dead: Error | null = null
  const pending = new Map<number, { resultType: string; resolve(value: Result): void; reject(error: Error): void }>()

  return new Promise((resolveStart, rejectStart) => {
    const fail = (error: Error) => {
      dead = error
      rejectStart(error)
      pending.forEach((call) => call.reject(error))
      pending.clear()
    }
    worker.addEventListener('error', (event) => {
      event.preventDefault?.()
      fail(new Error((event as ErrorEvent).message || 'The worker could not start.'))
    })
    worker.addEventListener('message', (event) => {
      const answer = (event as MessageEvent<Answer>).data
      if (answer.type === 'ready') {
        resolveStart({
          request(message, resultType, transfer = []) {
            if (dead) return Promise.reject(dead)
            const id = nextId++
            return new Promise<Result>((resolve, reject) => {
              pending.set(id, { resultType, resolve, reject })
              worker.postMessage({ ...message, id }, transfer)
            })
          },
          terminate() {
            fail(new Error('The worker was stopped.'))
            worker.terminate()
          },
        })
        return
      }
      if (answer.type === 'init-error') {
        fail(new Error(answer.message ?? 'The model could not start.'))
        return
      }
      const call = answer.id === undefined ? undefined : pending.get(answer.id)
      if (!call) return
      pending.delete(answer.id!)
      if (answer.type === call.resultType) call.resolve(answer as Result)
      else call.reject(new Error(answer.message ?? `Unexpected answer: ${answer.type}`))
    })
    worker.postMessage({ type: 'init' })
  })
}

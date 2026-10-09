import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import { WORDING_MODEL, WORDING_MODEL_NAME, WORDING_MODEL_RECORDS } from '../src/features/municipal/llm/model'
import {
  checkLlmQualityDraft,
  LLM_QUALITY_FIXTURES,
  LLM_QUALITY_MIN_ACCEPTED,
} from './llm-quality-fixtures'

type QualityDiagnostics = {
  selectedModel: string | null
  shaderF16: boolean | null
  phase: string
  requests: Array<{ phase: string; url: string; resourceType: string }>
  failedRequests: Array<{ phase: string; url: string; error: string | null }>
  pageErrors: string[]
  consoleErrors: string[]
  workerUrls: string[]
  workerConsoleErrors: string[]
  workerError: string | null
  cacheKeys: Array<{ name: string; urls: string[] }>
  initialUiDraft: { text: string; result: 'accepted' | 'guard-rejected' } | null
  corpus: Array<{
    id: string
    scenario: string
    milliseconds: number
    text: string
    guard: ReturnType<typeof checkLlmQualityDraft>
  }>
  accepted: number | null
}

function watchQualityDiagnostics(context: BrowserContext, page: Page, diagnostics: QualityDiagnostics) {
  context.on('request', (request) => {
    diagnostics.requests.push({ phase: diagnostics.phase, url: request.url(), resourceType: request.resourceType() })
  })
  context.on('requestfailed', (request) => {
    diagnostics.failedRequests.push({
      phase: diagnostics.phase,
      url: request.url(),
      error: request.failure()?.errorText ?? null,
    })
  })
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text())
  })
  page.on('worker', (worker) => {
    diagnostics.workerUrls.push(worker.url())
    worker.on('console', (message) => {
      if (message.type() === 'error') diagnostics.workerConsoleErrors.push(message.text())
    })
  })
}

async function snapshotCaches(page: Page) {
  return page.evaluate(async () => {
    const names = await caches.keys()
    return Promise.all(
      names.map(async (name) => ({
        name,
        urls: (await (await caches.open(name)).keys()).map((request) => request.url),
      })),
    )
  })
}

async function attachDiagnostics(testInfo: TestInfo, diagnostics: QualityDiagnostics) {
  await testInfo.attach('llm-quality-corpus.json', {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json',
  })
}

test('real Qwen meets the guarded 8-of-10 wording quality threshold', async ({ page, context, browserName }, testInfo) => {
  test.skip(
    process.env.RUN_REAL_LLM_QUALITY !== '1',
    'Opt in with RUN_REAL_LLM_QUALITY=1: this downloads the real Qwen model and runs 11 WebGPU generations.',
  )
  test.skip(browserName !== 'chromium', 'The real WebGPU wording quality corpus runs in Chromium only.')
  test.setTimeout(1_800_000)

  const diagnostics: QualityDiagnostics = {
    selectedModel: null,
    shaderF16: null,
    phase: 'startup',
    requests: [],
    failedRequests: [],
    pageErrors: [],
    consoleErrors: [],
    workerUrls: [],
    workerConsoleErrors: [],
    workerError: null,
    cacheKeys: [],
    initialUiDraft: null,
    corpus: [],
    accepted: null,
  }
  watchQualityDiagnostics(context, page, diagnostics)

  try {
    await page.goto('/municipal/plan')
    await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
    await expect(page.getByRole('heading', { level: 1, name: /^Plan for week \d{4}-W\d{2}$/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'The plan' })).toBeVisible()

    const gpu = await page.evaluate(async () => {
      type Adapter = { features: { has(feature: string): boolean }; info?: { isFallbackAdapter?: boolean } }
      const nav = navigator as Navigator & { gpu?: { requestAdapter(options?: { powerPreference?: string }): Promise<Adapter | null> } }
      if (!nav.gpu) return { available: false, f16: null, reason: 'WebGPU is unavailable in this browser.' }
      let adapter: Adapter | null
      try {
        adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' })
      } catch (error) {
        return { available: false, f16: null, reason: `WebGPU adapter request failed: ${String(error)}` }
      }
      if (!adapter) return { available: false, f16: null, reason: 'WebGPU returned no adapter.' }
      if (adapter.info?.isFallbackAdapter) return { available: false, f16: null, reason: 'WebGPU selected a software fallback adapter.' }
      return { available: true, f16: adapter.features.has('shader-f16'), reason: '' }
    })
    if (!gpu.available) test.skip(true, `Real Qwen quality test needs hardware WebGPU: ${gpu.reason}`)

    diagnostics.shaderF16 = gpu.f16
    diagnostics.selectedModel = gpu.f16 ? WORDING_MODEL.f16 : WORDING_MODEL.f32
    const modelRecord = gpu.f16 ? WORDING_MODEL_RECORDS.f16 : WORDING_MODEL_RECORDS.f32
    const modelRoot = `${modelRecord.model.replace(/\/$/, '')}/resolve/main/`

    const panel = page.getByRole('region', { name: 'Draft wording by the on-device AI: check before approving' })
    const start = panel.getByRole('button', { name: 'Write the wording with AI' })
    const unavailable = page.getByRole('button', { name: 'Write the wording yourself', exact: true })
    await expect(start.or(unavailable)).toBeVisible({ timeout: 15_000 })
    if (await unavailable.isVisible()) {
      test.skip(true, 'The app capability check rejected WebGPU; no real model initialization was attempted.')
    }

    // Initialize through the production UI first. This downloads the selected
    // model files and worker using the same cache paths that the offline app uses.
    diagnostics.phase = 'online-ui-initialization'
    await start.click()
    const complete = panel.getByText(new RegExp(`^Written on this laptop · ${WORDING_MODEL_NAME} ·`))
    const failed = panel.getByText("The writing AI didn't finish")
    await expect(complete.or(failed)).toBeVisible({ timeout: 110_000 })
    if (await failed.isVisible()) {
      throw new Error(`The production UI could not initialize or run Qwen: ${(await panel.innerText()).replace(/\s+/g, ' ')}`)
    }
    const initialRejection = panel.getByRole('alert').filter({ hasText: "The draft didn't match the plan, so it wasn't used" })
    const initialWording = page.getByRole('textbox', { name: 'Plan wording' })
    await expect
      .poll(async () => (await initialRejection.isVisible()) || (await initialWording.inputValue()).trim().length > 0, { timeout: 10_000 })
      .toBe(true)
    const initialRejected = await initialRejection.isVisible()
    diagnostics.initialUiDraft = {
      text: (await panel.innerText()).replace(/\s+/g, ' ').trim(),
      result: initialRejected ? 'guard-rejected' : 'accepted',
    }

    const appWorkerUrl = diagnostics.workerUrls.find((url) => /webllm\.worker/i.test(new URL(url).pathname))
    expect(appWorkerUrl, 'the production UI created its actual wording worker').toBeTruthy()
    diagnostics.cacheKeys = await snapshotCaches(page)
    const workerCache = diagnostics.cacheKeys.find((cache) => cache.name === 'agapay-laptop-ai')
    expect(workerCache?.urls, 'the production worker script is cached').toContain(appWorkerUrl)
    expect(
      diagnostics.cacheKeys.find((cache) => cache.name === 'webllm/config')?.urls,
      'the selected model config is cached',
    ).toContain(`${modelRoot}mlc-chat-config.json`)
    expect(
      diagnostics.cacheKeys.find((cache) => cache.name === 'webllm/wasm')?.urls,
      'the selected model WebGPU library is cached',
    ).toContain(modelRecord.model_lib)
    const modelUrls = diagnostics.cacheKeys.find((cache) => cache.name === 'webllm/model')?.urls ?? []
    expect(modelUrls, 'the selected model tokenizer and tensor index are cached').toContain(`${modelRoot}tensor-cache.json`)
    expect(modelUrls.some((url) => url.startsWith(modelRoot) && /tokenizer\.(json|model)$/.test(url))).toBe(true)
    expect(modelUrls.some((url) => url.startsWith(modelRoot) && /\.(bin|safetensors)$/.test(url))).toBe(true)

    diagnostics.phase = 'offline-worker-quality-corpus'
    await context.setOffline(true)
    const reload = await page.reload()
    expect(reload?.fromServiceWorker(), 'the quality trial page reloads from the production service worker offline').toBe(true)
    await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
    await expect(page.getByRole('button', { name: 'Runs on this laptop' })).toBeVisible({ timeout: 30_000 })

    // The browser protocol is the app's real worker protocol. A fresh worker
    // uses the UI-selected production worker URL and the already-cached model.
    let generated: { results: Array<{ id: string; milliseconds: number; text: string }>; error: string | null }
    try {
      generated = await page.evaluate(
        async ({ workerUrl, shaderF16, fixtures }) => {
          const worker = new Worker(workerUrl, { type: 'module' })
          let nextId = 1
          const request = (type: 'init' | 'run', fields: Record<string, unknown>, expected: 'ready' | 'result', timeoutMs: number) => {
            const id = nextId++
            return new Promise<unknown>((resolve, reject) => {
              const cleanup = () => {
                clearTimeout(timeout)
                worker.removeEventListener('message', onMessage)
                worker.removeEventListener('error', onError)
              }
              const timeout = setTimeout(() => {
                cleanup()
                reject(new Error(`${type} request ${id} timed out after ${timeoutMs} ms`))
              }, timeoutMs)
              const onError = (event: ErrorEvent) => {
                cleanup()
                reject(new Error(event.message || `worker failed during ${type}`))
              }
              const onMessage = (event: MessageEvent) => {
                const response = event.data as { type: string; id: number; output?: unknown; code?: string; message?: string }
                if (response.id !== id || response.type === 'progress') return
                cleanup()
                if (response.type === 'error') reject(new Error(`${response.code ?? 'worker-error'}: ${response.message ?? ''}`))
                else if (response.type === expected) resolve(response.output)
                else reject(new Error(`Expected ${expected}; received ${response.type}`))
              }
              worker.addEventListener('message', onMessage)
              worker.addEventListener('error', onError)
              worker.postMessage(
                type === 'init'
                  ? { type, id, backend: { kind: 'webgpu', f16: shaderF16, reason: 'opt-in real model quality corpus' } }
                  : { type, id, input: fields.input },
              )
            })
          }

          const results: Array<{ id: string; milliseconds: number; text: string }> = []
          let error: string | null = null
          try {
            await request('init', {}, 'ready', 180_000)
            for (const fixture of fixtures) {
              const started = performance.now()
              const text = await request(
                'run',
                { input: { messages: fixture.messages, maxTokens: fixture.maxTokens } },
                'result',
                120_000,
              )
              results.push({ id: fixture.id, milliseconds: performance.now() - started, text: String(text ?? '') })
            }
          } catch (failure) {
            error = failure instanceof Error ? failure.message : String(failure)
          } finally {
            worker.terminate()
          }
          return { results, error }
        },
        {
          workerUrl: appWorkerUrl!,
          shaderF16: gpu.f16,
          fixtures: LLM_QUALITY_FIXTURES.map(({ id, messages, maxTokens }) => ({ id, messages, maxTokens })),
        },
      )
    } catch (error) {
      diagnostics.workerError = error instanceof Error ? error.message : String(error)
      throw error
    }

    diagnostics.workerError = generated.error
    const byId = new Map(generated.results.map((result) => [result.id, result]))
    for (const fixture of LLM_QUALITY_FIXTURES) {
      const output = byId.get(fixture.id)
      if (!output) continue
      const text = output!.text
      diagnostics.corpus.push({
        id: fixture.id,
        scenario: fixture.scenario,
        milliseconds: output!.milliseconds,
        text,
        guard: checkLlmQualityDraft(fixture, text),
      })
    }
    diagnostics.accepted = diagnostics.corpus.filter((result) => result.guard.ok).length
    expect(diagnostics.workerError, 'the worker initialized and generated every corpus case').toBeNull()

    const origin = new URL(testInfo.project.use.baseURL as string).origin
    const externalOfflineRequests = diagnostics.requests
      .filter((request) => request.phase === 'offline-worker-quality-corpus')
      .filter(({ url }) => !url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:'))
    expect(externalOfflineRequests, 'the offline real-model corpus makes no requests to other origins').toEqual([])
    expect(
      diagnostics.failedRequests.filter((request) => request.phase === 'offline-worker-quality-corpus'),
      'offline app reload and worker produce no failed requests',
    ).toEqual([])
    expect(diagnostics.pageErrors).toEqual([])
    expect(diagnostics.corpus, 'all ten real model drafts were recorded').toHaveLength(10)
    expect(
      diagnostics.accepted,
      `the existing production guard must accept at least ${LLM_QUALITY_MIN_ACCEPTED} of 10 drafts`,
    ).toBeGreaterThanOrEqual(LLM_QUALITY_MIN_ACCEPTED)
  } finally {
    diagnostics.cacheKeys = await snapshotCaches(page).catch(() => diagnostics.cacheKeys)
    await attachDiagnostics(testInfo, diagnostics)
  }
})

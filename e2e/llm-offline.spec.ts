import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import { WORDING_MODEL, WORDING_MODEL_NAME, WORDING_MODEL_RECORDS } from '../src/features/municipal/llm/model'

type RequestRecord = {
  phase: string
  url: string
  resourceType: string
}

type FailureRecord = {
  phase: string
  url: string
  error: string | null
}

type LlmDiagnostics = {
  selectedModel: string | null
  shaderF16: boolean | null
  phase: string
  requests: RequestRecord[]
  failedRequests: FailureRecord[]
  pageErrors: string[]
  consoleErrors: string[]
  workerUrls: string[]
  workerConsoleErrors: string[]
  cacheSnapshot: Array<{ name: string; urls: string[] }>
  runs: Array<{ phase: string; outcome: 'accepted' | 'guard-rejected'; message: string }>
}

function recordLlmDiagnostics(context: BrowserContext, page: Page, diagnostics: LlmDiagnostics) {
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

async function waitForRealInferenceAndGuardResult(page: Page, phase: string, diagnostics: LlmDiagnostics) {
  const panel = page.getByRole('region', { name: 'Draft wording by the on-device AI: check before approving' })
  const complete = panel.getByText(new RegExp(`^Written on this laptop · ${WORDING_MODEL_NAME} ·`))
  const failed = panel.getByText("The writing AI didn't finish")
  await expect(complete.or(failed)).toBeVisible({ timeout: 110_000 })

  // A rejected draft still proves real inference completed. The guard must make
  // the rejection visible and leave the fixed plan available to the officer.
  if (await failed.isVisible()) {
    const details = (await panel.innerText()).replace(/\s+/g, ' ').trim()
    throw new Error(`${phase}: real local inference failed before the draft could be checked: ${details}`)
  }

  const rejected = panel.getByRole('alert').filter({ hasText: "The draft didn't match the plan, so it wasn't used" })
  const wording = page.getByRole('textbox', { name: 'Plan wording' })
  await expect
    .poll(async () => (await rejected.isVisible()) || (await wording.inputValue()).trim().length > 0, { timeout: 10_000 })
    .toBe(true)
  const guardRejected = await rejected.isVisible()
  if (guardRejected) {
    await expect(page.getByRole('heading', { name: 'The plan' })).toBeVisible()
    await expect(rejected).toBeVisible()
  } else {
    await expect(wording).toHaveValue(/\S/)
  }
  await expect(page.getByRole('button', { name: 'Approve plan' })).toBeEnabled()

  const message = (await panel.innerText()).replace(/\s+/g, ' ').trim()
  diagnostics.runs.push({ phase, outcome: guardRejected ? 'guard-rejected' : 'accepted', message })
}

async function attachDiagnostics(testInfo: TestInfo, diagnostics: LlmDiagnostics) {
  await testInfo.attach('llm-offline-diagnostics.json', {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json',
  })
}

test('real Qwen inference and offline cache survive three full reloads', async ({ page, context, browserName, baseURL }, testInfo) => {
  test.skip(
    process.env.RUN_REAL_LLM !== '1',
    'Opt in with RUN_REAL_LLM=1: this downloads the real Qwen model and performs WebGPU inference.',
  )
  test.skip(browserName !== 'chromium', 'The real WebGPU model regression runs in Chromium only; WebKit CI is an iPhone profile without the laptop GPU runtime.')
  test.setTimeout(480_000)

  const diagnostics: LlmDiagnostics = {
    selectedModel: null,
    shaderF16: null,
    phase: 'startup',
    requests: [],
    failedRequests: [],
    pageErrors: [],
    consoleErrors: [],
    workerUrls: [],
    workerConsoleErrors: [],
    cacheSnapshot: [],
    runs: [],
  }
  recordLlmDiagnostics(context, page, diagnostics)

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
    if (!gpu.available) test.skip(true, `Real Qwen regression needs a usable hardware WebGPU adapter: ${gpu.reason}`)
    diagnostics.shaderF16 = gpu.f16
    diagnostics.selectedModel = gpu.f16 ? WORDING_MODEL.f16 : WORDING_MODEL.f32
    const modelRecord = gpu.f16 ? WORDING_MODEL_RECORDS.f16 : WORDING_MODEL_RECORDS.f32
    const modelRoot = `${modelRecord.model.replace(/\/$/, '')}/resolve/main/`

    const panel = page.getByRole('region', { name: 'Draft wording by the on-device AI: check before approving' })
    const start = panel.getByRole('button', { name: 'Write the wording with AI' })
    const unavailable = page.getByRole('button', { name: 'Write the wording yourself', exact: true })
    await expect(start.or(unavailable)).toBeVisible({ timeout: 15_000 })
    if (await unavailable.isVisible()) {
      test.skip(true, 'The app capability check rejected WebGPU; no real model download or inference was attempted.')
    }

    diagnostics.phase = 'online-initialization-and-generation'
    await start.click()
    await waitForRealInferenceAndGuardResult(page, diagnostics.phase, diagnostics)
    diagnostics.cacheSnapshot = await snapshotCaches(page)

    const wordingWorker = diagnostics.workerUrls.find((url) => /webllm\.worker/i.test(new URL(url).pathname))
    expect(wordingWorker, 'the production wording worker was created').toBeTruthy()
    const workerCache = diagnostics.cacheSnapshot.find((cache) => cache.name === 'agapay-laptop-ai')
    const workerCached = workerCache?.urls.includes(wordingWorker!) ?? false
    expect(workerCached, 'the real wording worker script is present in Cache Storage after its online load').toBe(true)

    const configCache = diagnostics.cacheSnapshot.find((cache) => cache.name === 'webllm/config')
    const wasmCache = diagnostics.cacheSnapshot.find((cache) => cache.name === 'webllm/wasm')
    const modelCache = diagnostics.cacheSnapshot.find((cache) => cache.name === 'webllm/model')
    expect(configCache?.urls, 'the selected Qwen model config was cached').toContain(`${modelRoot}mlc-chat-config.json`)
    expect(wasmCache?.urls, 'the selected Qwen WebGPU library was cached').toContain(modelRecord.model_lib)
    expect(modelCache?.urls, 'the selected Qwen tokenizer config was cached').toContain(`${modelRoot}tensor-cache.json`)
    expect(modelCache?.urls.some((url) => url.startsWith(modelRoot) && /tokenizer\.(json|model)$/.test(url))).toBe(true)
    expect(modelCache?.urls.some((url) => url.startsWith(modelRoot) && /\.(bin|safetensors)$/.test(url))).toBe(true)

    await context.setOffline(true)
    const appOrigin = new URL(baseURL!).origin
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      diagnostics.phase = `offline-reload-${attempt}`
      const response = await page.reload()
      expect(response?.fromServiceWorker(), `offline reload ${attempt} uses the production service worker`).toBe(true)
      await expect(page.locator('html')).toHaveAttribute('data-shell-status', 'ready', { timeout: 30_000 })
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
      await expect(page.getByRole('heading', { name: 'The plan' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Runs on this laptop' })).toBeVisible({ timeout: 30_000 })

      const panelAfterReload = page.getByRole('region', { name: 'Draft wording by the on-device AI: check before approving' })
      const generate = panelAfterReload.getByRole('button', { name: 'Write the wording with AI' })
      const unavailableAfterReload = page.getByRole('button', { name: 'Write the wording yourself', exact: true })
      await expect(generate.or(unavailableAfterReload)).toBeVisible({ timeout: 15_000 })
      if (await unavailableAfterReload.isVisible()) {
        throw new Error(`offline reload ${attempt}: the app did not expose its real WebGPU wording action`)
      }

      await generate.click()
      await waitForRealInferenceAndGuardResult(page, `offline-reload-${attempt}-generation`, diagnostics)
      diagnostics.cacheSnapshot = await snapshotCaches(page)
    }

    const offlineRequests = diagnostics.requests.filter((request) => request.phase.startsWith('offline-'))
    const externalOfflineRequests = offlineRequests.filter(
      ({ url }) => !url.startsWith(appOrigin) && !url.startsWith('blob:') && !url.startsWith('data:'),
    )
    expect(externalOfflineRequests, 'offline app and model work make no requests to other origins').toEqual([])
    const offlineFailures = diagnostics.failedRequests.filter((request) => request.phase.startsWith('offline-'))
    expect(offlineFailures, 'offline reloads and inference produce no failed network requests').toEqual([])
    expect(diagnostics.pageErrors, 'the page has no uncaught errors').toEqual([])
    expect(diagnostics.runs).toHaveLength(4)
    if (process.env.REQUIRE_REAL_LLM_WORDING === '1') {
      expect(
        diagnostics.runs.filter((run) => run.outcome === 'accepted'),
        'REQUIRE_REAL_LLM_WORDING=1 requires the guard to accept the online draft and all three offline drafts',
      ).toHaveLength(4)
    }
  } finally {
    diagnostics.cacheSnapshot = await snapshotCaches(page).catch(() => diagnostics.cacheSnapshot)
    await attachDiagnostics(testInfo, diagnostics)
  }
})

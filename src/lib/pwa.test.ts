import { describe, expect, it, vi } from 'vitest'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'
import { createAppShell } from './pwa'

function startShell(supported = true, ready: Promise<unknown> = new Promise(() => {})) {
  const shell = createAppShell()
  let options: RegisterSWOptions = {}
  const register = vi.fn((o: RegisterSWOptions) => {
    options = o
  })
  const reload = vi.fn()
  shell.start({ register, supported, reload, ready })
  return { shell, register, reload, options: () => options }
}

// A registration whose worker is still installing, like a first visit.
function installingRegistration() {
  const worker = Object.assign(new EventTarget(), { state: 'installing' as ServiceWorkerState })
  const registration = { active: null, installing: worker } as unknown as ServiceWorkerRegistration
  const setState = (state: ServiceWorkerState) => {
    worker.state = state
    worker.dispatchEvent(new Event('statechange'))
  }
  return { registration, setState }
}

const activeRegistration = { active: {} } as ServiceWorkerRegistration
const newRegistration = { active: null } as ServiceWorkerRegistration

describe('createAppShell', () => {
  it('is unavailable without service worker support and never registers', () => {
    const { shell, register } = startShell(false)
    expect(shell.getStatus()).toBe('unavailable')
    expect(register).not.toHaveBeenCalled()
  })

  it('registers immediately and is installing until the first install finishes', () => {
    const { shell, register, options } = startShell()
    expect(register).toHaveBeenCalledOnce()
    expect(options().immediate).toBe(true)
    options().onRegisteredSW?.('/sw.js', newRegistration)
    expect(shell.getStatus()).toBe('installing')
    options().onOfflineReady?.()
    expect(shell.getStatus()).toBe('ready')
  })

  it('is ready on a returning visit, when a worker is already active', () => {
    const { shell, options } = startShell()
    options().onRegisteredSW?.('/sw.js', activeRegistration)
    expect(shell.getStatus()).toBe('ready')
  })

  it('is ready once serviceWorker.ready resolves, even if the page reloaded mid-install', async () => {
    let resolveReady: (value: unknown) => void = () => {}
    const ready = new Promise((resolve) => (resolveReady = resolve))
    const { shell, options } = startShell(true, ready)
    // The reloaded page sees the install already under way: no onOfflineReady comes.
    options().onRegisteredSW?.('/sw.js', installingRegistration().registration)
    expect(shell.getStatus()).toBe('installing')
    resolveReady({})
    await ready
    await Promise.resolve()
    expect(shell.getStatus()).toBe('ready')
  })

  it('reports an error when the first precache install fails', () => {
    const { shell, options } = startShell()
    const { registration, setState } = installingRegistration()
    options().onRegisteredSW?.('/sw.js', registration)
    setState('installed')
    expect(shell.getStatus()).toBe('installing')
    setState('redundant')
    expect(shell.getStatus()).toBe('error')
  })

  it('keeps a cached shell ready when an update install fails', () => {
    const { shell, options } = startShell()
    const { registration, setState } = installingRegistration()
    options().onRegisteredSW?.('/sw.js', { ...registration, active: {} } as ServiceWorkerRegistration)
    expect(shell.getStatus()).toBe('ready')
    setState('redundant')
    expect(shell.getStatus()).toBe('ready')
  })

  it('reports a failed registration, but never downgrades a cached shell', () => {
    const first = startShell()
    first.options().onRegisterError?.(new Error('blocked'))
    expect(first.shell.getStatus()).toBe('error')

    const second = startShell()
    second.options().onOfflineReady?.()
    second.options().onRegisterError?.(new Error('update check failed'))
    expect(second.shell.getStatus()).toBe('ready')
  })

  it('notifies subscribers on each change until they unsubscribe', () => {
    const { shell, options } = startShell()
    const listener = vi.fn()
    const unsubscribe = shell.subscribe(listener)
    options().onOfflineReady?.()
    options().onOfflineReady?.()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    options().onRegisterError?.(new Error('x'))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('holdReload', () => {
  it('reloads right away for a new version when nothing holds it', () => {
    const { reload, options } = startShell()
    options().onNeedReload?.()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('waits until every hold is released, then reloads once', () => {
    const { shell, reload, options } = startShell()
    const releaseDownload = shell.holdReload()
    const releaseForm = shell.holdReload()
    options().onNeedReload?.()
    expect(reload).not.toHaveBeenCalled()

    releaseDownload()
    releaseDownload()
    expect(reload).not.toHaveBeenCalled()

    releaseForm()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not reload on release when no new version arrived', () => {
    const { shell, reload } = startShell()
    shell.holdReload()()
    expect(reload).not.toHaveBeenCalled()
  })
})

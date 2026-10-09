import { describe, expect, it, vi } from 'vitest'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'
import { createAppShell } from './pwa'

function startShell(supported = true) {
  const shell = createAppShell()
  let options: RegisterSWOptions = {}
  const register = vi.fn((o: RegisterSWOptions) => {
    options = o
  })
  const reload = vi.fn()
  shell.start({ register, supported, reload })
  return { shell, register, reload, options: () => options }
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

import { describe, expect, it } from 'vitest'
import { planChangedSinceShown, rememberPlanShown } from './planShown'

function memory() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) }
}

describe('planChangedSinceShown', () => {
  it('is true the first time and after a new report, false when nothing changed', () => {
    const storage = memory()
    expect(planChangedSinceShown('SID-BGS:2026-W41:3', storage)).toBe(true)
    rememberPlanShown('SID-BGS:2026-W41:3', storage)
    expect(planChangedSinceShown('SID-BGS:2026-W41:3', storage)).toBe(false)
    expect(planChangedSinceShown('SID-BGS:2026-W41:3|SID-MAL:2026-W41:4', storage)).toBe(true)
  })
  it('never animates when storage is blocked or missing', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(planChangedSinceShown('a', blocked)).toBe(false)
    expect(() => rememberPlanShown('a', blocked)).not.toThrow()
    expect(planChangedSinceShown('a', null)).toBe(false)
  })
})

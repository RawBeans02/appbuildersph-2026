import { describe, expect, it } from 'vitest'
import type { Plan } from '../../data/db/types'
import { approvedThisSession, justApproved, logRow, noteApproved, wordingLabel } from './log'
import type { LogEntry } from './municipal'

function memory() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) }
}

function entry(plan: Pick<Plan, 'draftText' | 'draftSource' | 'finalText'> | null): LogEntry {
  return {
    approval: { id: 'p1', approvedAt: '2026-10-10T01:31:00.000Z', approver: 'Municipal health officer', planSummary: '1. Doctor team to Maligaya-D first.', note: '', sample: false },
    plan: plan && { id: 'p1', epiWeek: '2026-W41', createdAt: '2026-10-10T01:31:00.000Z', rules: null, status: 'approved', ...plan },
  }
}

describe('approval log rows', () => {
  it('says where the wording came from, "Written by the officer" when there was no AI', () => {
    expect(wordingLabel(entry({ draftText: null, draftSource: 'template', finalText: '1. Send a doctor team to Maligaya-D first.' }))).toBe('Rules only')
    expect(wordingLabel(entry({ draftText: '', draftSource: 'template', finalText: 'Team to Maligaya-D today.' }))).toBe('Written by the officer')
    expect(wordingLabel(entry({ draftText: 'Draft', draftSource: 'template', finalText: 'Draft' }))).toBe('Rules only')
    expect(wordingLabel(entry({ draftText: 'AI words', draftSource: 'llm', finalText: 'AI words' }))).toBe('AI draft')
    expect(wordingLabel(entry({ draftText: 'AI words', draftSource: 'llm', finalText: 'AI words, edited' }))).toBe('AI draft, edited')
    expect(wordingLabel(entry(null))).toBe('Rules only')
  })

  it('keeps the full approved text (B25)', () => {
    expect(logRow(entry({ draftText: '', draftSource: 'template', finalText: ' Line one.\nLine two. ' })).text).toBe('Line one.\nLine two.')
    expect(logRow(entry(null)).text).toBeNull()
  })

  it('marks the newest row "Just now" only when it was approved in this session, and lands it once', () => {
    const storage = memory()
    const rows = [{ id: 'new' }, { id: 'old' }]
    expect(justApproved(rows, storage)).toBeNull()
    noteApproved('old', storage)
    expect(justApproved(rows, storage)).toBeNull() // only the newest row
    noteApproved('new', storage)
    noteApproved('new', storage)
    expect(approvedThisSession(storage)).toEqual(['old', 'new'])
    expect(justApproved(rows, storage)).toEqual({ id: 'new', land: true })
    expect(justApproved(rows, storage)).toEqual({ id: 'new', land: false })
    expect(justApproved([], storage)).toBeNull()
  })

  it('does nothing when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(() => noteApproved('a', blocked)).not.toThrow()
    expect(approvedThisSession(blocked)).toEqual([])
    expect(justApproved([{ id: 'a' }], blocked)).toBeNull()
    expect(justApproved([{ id: 'a' }], null)).toBeNull()
  })
})

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { openAgapayDb, type AgapayDb } from '../../data/db/db'
import type { WatchCheck } from '../../data/db/types'
import { stepFromSearch, stepUrl } from './steps'
import { readWatchChecks, recordWatchCheck, rowStatus } from './watchChecks'
import { floodDateWords, higherRiskWords, householdWords, inDaysWords, kindWords, peopleWords } from './words'

describe('watch words', () => {
  it('writes exposure details and counts as the copy deck does', () => {
    expect(kindWords(['waded', 'open-wound', 'repeated'])).toBe('waded, open wound, repeated')
    expect(higherRiskWords(['waded', 'repeated'])).toBe('Higher: repeated contact')
    expect(higherRiskWords(['waded', 'open-wound'])).toBe('Higher: open wound')
    expect(higherRiskWords(['waded'])).toBeNull()
    expect([peopleWords(9), peopleWords(1), householdWords(3), householdWords(1)]).toEqual([
      '9 people',
      '1 person',
      '3 households',
      '1 household',
    ])
    expect([inDaysWords(5), inDaysWords(1)]).toEqual(['in 5 days', 'in 1 day'])
  })

  it('writes the flood date, with "Today" on the day', () => {
    expect(floodDateWords('2026-10-04', '2026-10-04')).toBe('Today, Sun Oct 4, 2026')
    expect(floodDateWords('2026-10-03', '2026-10-04')).toBe('Sat Oct 3, 2026')
  })
})

describe('watch checks', () => {
  // Local times, so the day matches the device's calendar.
  const at = (day: string, time: string) => new Date(`${day}T${time}`)
  const check = (residentId: string, when: Date, result: WatchCheck['result']): WatchCheck => ({
    id: `${residentId}-${when.getTime()}`,
    residentId,
    checkedAt: when.toISOString(),
    result,
    sample: false,
  })

  it('shows "Checked" on the day only, and a referral until a later check', () => {
    const checked = check('r1', at('2026-10-10', '08:15'), 'no-signs')
    expect(rowStatus([checked], 'r1', '2026-10-04', '2026-10-10')).toEqual({ kind: 'checked', at: at('2026-10-10', '08:15') })
    expect(rowStatus([checked], 'r1', '2026-10-04', '2026-10-11')).toBeNull()

    const referred = check('r1', at('2026-10-09', '15:00'), 'referred')
    expect(rowStatus([referred], 'r1', '2026-10-04', '2026-10-12')).toMatchObject({ kind: 'referred' })
    expect(rowStatus([referred, checked], 'r1', '2026-10-04', '2026-10-10')).toMatchObject({ kind: 'checked' })
  })

  it('ignores checks from before this contact, and other residents', () => {
    const old = check('r1', at('2026-09-20', '09:00'), 'referred')
    expect(rowStatus([old], 'r1', '2026-10-04', '2026-10-10')).toBeNull()
    expect(rowStatus([check('r2', at('2026-10-10', '08:00'), 'no-signs')], 'r1', '2026-10-04', '2026-10-10')).toBeNull()
  })

  let db: AgapayDb | undefined
  afterEach(() => db?.close())

  it('records a check and reads them back by resident, newest first', async () => {
    db = await openAgapayDb('watch-checks-test')
    await recordWatchCheck(db, 'r1', 'no-signs', at('2026-10-09', '08:00'))
    const referred = await recordWatchCheck(db, 'r1', 'referred', at('2026-10-10', '09:00'))
    await recordWatchCheck(db, 'r2', 'no-signs', at('2026-10-10', '10:00'))
    const checks = await readWatchChecks(db, ['r1'])
    expect(checks.map((c) => c.result)).toEqual(['referred', 'no-signs'])
    await db.watchChecks.delete(referred.id)
    expect(await readWatchChecks(db, ['r1', 'r2'])).toHaveLength(2)
  })
})

describe('watch steps', () => {
  it('reads the flow step from the URL, and writes it back', () => {
    expect(stepFromSearch('')).toBe('list')
    expect(stepFromSearch('?step=log')).toBe('log')
    expect(stepFromSearch('?step=mark')).toBe('mark')
    expect(stepFromSearch('?step=other')).toBe('list')
    expect(['list', 'log', 'mark'].map((step) => stepUrl(step as 'list'))).toEqual(['/watch', '/watch?step=log', '/watch?step=mark'])
  })
})

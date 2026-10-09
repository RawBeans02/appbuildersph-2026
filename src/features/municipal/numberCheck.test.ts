import { describe, expect, it } from 'vitest'
import { checkLine, checkNumbers } from './numberCheck'

const PLAN = 'Week 2026-W41. 1. Maligaya-D: 9 in the watch window, fast-breathing (1–4), 30 of 40 capsules expire within 6 weeks. Move 60.'

describe('checkNumbers (screen 19a)', () => {
  it('splits the wording into text and numbers; a week, a range and "<5" are one number each', () => {
    const check = checkNumbers('Week 2026-W41: 9 in the window, 1–4 referrals, <5 here.', `${PLAN} <5`)
    expect(check.segments).toEqual([
      { text: 'Week ' },
      { text: '2026-W41', number: 'found' },
      { text: ': ' },
      { text: '9', number: 'found' },
      { text: ' in the window, ' },
      { text: '1–4', number: 'found' },
      { text: ' referrals, ' },
      { text: '<5', number: 'found' },
      { text: ' here.' },
    ])
    expect(check.total).toBe(4)
    expect(check.segments.map((segment) => segment.text).join('')).toBe('Week 2026-W41: 9 in the window, 1–4 referrals, <5 here.')
  })

  it('flags a number the plan doesn’t have, and a number word too', () => {
    const check = checkNumbers('Send 45 capsules to Maligaya-D, and forty-five more, and 9 people.', PLAN)
    expect(check.mismatched).toEqual(['45', 'five'])
    expect(check.segments.filter((segment) => segment.number).map((s) => [s.text, s.number])).toEqual([
      ['45', 'new'],
      ['forty', 'found'],
      ['five', 'new'],
      ['9', 'found'],
    ])
    expect(checkLine(check)).toEqual({ tone: 'warn', text: "2 numbers don't match the plan: 45, five" })
    expect(checkLine(checkNumbers('Move 45 capsules.', PLAN))).toEqual({
      tone: 'warn',
      text: "1 number doesn't match the plan: 45",
    })
  })

  it('never says every number matches: a number found in the plan may still be in the wrong place', () => {
    const swapped = checkNumbers('Move 9 capsules; 60 are in the watch window.', PLAN)
    expect(swapped.mismatched).toEqual([])
    expect(checkLine(swapped)).toEqual({ tone: 'info', text: 'No new numbers found; check each number against the table above' })
  })

  it('has no line for wording without numbers, or no wording', () => {
    expect(checkLine(checkNumbers('Send a doctor team to Maligaya-D first.', PLAN))).toBeNull()
    expect(checkNumbers('', PLAN)).toEqual({ segments: [], total: 0, mismatched: [] })
  })
})

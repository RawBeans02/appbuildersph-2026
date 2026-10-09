import { describe, expect, it } from 'vitest'
import { DANGER_SIGNS } from '../../rules/imci'
import { ageBand, bandText, DANGER_SIGN_COPY, DANGER_SIGN_ROWS, joinAnd, metaLine, refusalText, savedText } from './copy'

const toddler = ageBand(18)!

describe('Hinga copy (design/COPY.md)', () => {
  it('names the IMCI age bands with their cut-offs', () => {
    expect([0, 1, 2, 11, 12, 59].map((months) => ageBand(months))).toEqual([
      { firstMonth: 0, label: 'Under 2 months', cutoff: 60 },
      { firstMonth: 0, label: 'Under 2 months', cutoff: 60 },
      { firstMonth: 2, label: '2 to 11 months', cutoff: 50 },
      { firstMonth: 2, label: '2 to 11 months', cutoff: 50 },
      { firstMonth: 12, label: '1 to 4 years', cutoff: 40 },
      { firstMonth: 12, label: '1 to 4 years', cutoff: 40 },
    ])
    expect(ageBand(60)).toBeNull()
  })

  it('has a row for every danger sign in imci.ts, in the pass 1b order', () => {
    expect(Object.keys(DANGER_SIGN_COPY)).toEqual(DANGER_SIGNS.map((sign) => sign.id))
    expect([...DANGER_SIGN_ROWS].sort()).toEqual(DANGER_SIGNS.map((sign) => sign.id).sort())
    expect(DANGER_SIGN_ROWS.map((sign) => DANGER_SIGN_COPY[sign]).map(({ label, term }) => (term ? `${label} (${term})` : label))).toEqual([
      'Chest pulls in when breathing in (chest indrawing)',
      'Harsh noise when breathing in (stridor)',
      "Can't drink or breastfeed",
      'Vomits everything',
      'Convulsions (kombulsyon)',
      'Very sleepy or hard to wake',
    ])
  })

  it('writes the band lines', () => {
    expect(bandText('fast', 52, toddler, [])).toEqual({
      label: 'Fast breathing for age',
      perMin: 52,
      line: 'The cut-off for 1 to 4 years is 40.',
    })
    expect(bandText('not-fast', 38, ageBand(6)!, []).line).toBe('The cut-off for 2 to 11 months is 50.')
    expect(bandText('urgent', 52, toddler, ['chest-indrawing'])).toEqual({
      label: 'Urgent · danger sign',
      perMin: 52,
      line: 'Fast for 1 to 4 years (cut-off 40), and chest indrawing.',
    })
    expect(bandText('urgent', 52, toddler, ['convulsions', 'chest-indrawing', 'stridor']).line).toBe(
      'Fast for 1 to 4 years (cut-off 40), and convulsions, chest indrawing and stridor.',
    )
    expect(bandText('urgent', 30, toddler, ['stridor']).line).toBe('Not fast for 1 to 4 years (cut-off 40), but stridor.')
  })

  it('joins words with "and"', () => {
    expect(joinAnd([])).toBe('')
    expect(joinAnd(['a'])).toBe('a')
    expect(joinAnd(['a', 'b'])).toBe('a and b')
    expect(joinAnd(['a', 'b', 'c'])).toBe('a, b and c')
  })

  it('writes the meta line, marking a count by hand', () => {
    const resident = { name: 'Residente 010', householdId: 'HH-02' }
    expect(metaLine({ resident, band: toddler, time: '8:31 AM', method: 'camera' })).toBe(
      'Residente 010 · HH-02 · 1 to 4 years · 8:31 AM',
    )
    expect(metaLine({ resident: null, band: toddler, time: '8:31 AM', method: 'hand' })).toBe(
      '1 to 4 years · 8:31 AM · Counted by hand',
    )
  })

  it("writes 6c's confirmation", () => {
    expect(savedText('Residente 010', 0, '8:32 AM')).toEqual({
      title: "Saved to Residente 010's record",
      detail: 'No danger signs · 8:32 AM',
    })
    expect(savedText(null, 1, '8:32 AM').detail).toBe('1 danger sign ticked · 8:32 AM')
    expect(savedText(null, 2, '8:32 AM').detail).toBe('2 danger signs ticked · 8:32 AM')
  })

  it('maps every refusal to a designed message', () => {
    expect(refusalText('crying').title).toBe('Crying detected')
    expect(refusalText('motion').title).toBe('Too much movement')
    expect(refusalText('no-torso').title).toBe("Can't see the chest clearly")
    expect(refusalText('no-rhythm').title).toBe("Can't see the chest clearly")
    expect(refusalText('disagree').title).toBe("Readings didn't agree")
  })

  it('words the second refusal in a row (5e)', () => {
    expect(refusalText('motion', true)).toEqual({
      icon: 'motion',
      title: 'Still too much movement',
      body: 'Rest the phone on something steady and try once more, or count by hand. The app keeps the time and applies the cut-off.',
    })
    expect(refusalText('crying', true).title).toBe('Crying detected')
  })
})

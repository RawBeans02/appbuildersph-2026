import { describe, expect, it } from 'vitest'
import { buildHingaCheck, type CheckInput } from './check'

const base: CheckInput = {
  id: 'hinga-test',
  residentId: 'res-001',
  checkedAt: '2026-10-09T08:00:00.000Z',
  ageMonths: 14,
  method: 'camera',
  breathsPerMinute: 46,
  refusal: null,
  dangerSigns: [],
}

describe('Hinga check record', () => {
  it('saves a fast count against the age cut-off', () => {
    expect(buildHingaCheck(base)).toEqual({ ...base, outcome: 'fast', refusal: null, dangerSigns: [], sample: false })
  })

  it('saves a not-fast count', () => {
    expect(buildHingaCheck({ ...base, breathsPerMinute: 32 })).toMatchObject({ outcome: 'not-fast', refusal: null })
  })

  it('makes any danger sign urgent, with or without a count', () => {
    expect(buildHingaCheck({ ...base, breathsPerMinute: 30, dangerSigns: ['chest-indrawing'] })).toMatchObject({
      outcome: 'urgent',
      dangerSigns: ['chest-indrawing'],
    })
    expect(buildHingaCheck({ ...base, breathsPerMinute: null, refusal: 'crying', dangerSigns: ['convulsions'] })).toMatchObject({
      outcome: 'urgent',
      breathsPerMinute: null,
      refusal: 'crying',
    })
  })

  it('saves a danger sign checked without a count as URGENT, with no count and a valid reason', () => {
    for (const method of ['camera', 'hand'] as const) {
      expect(buildHingaCheck({ ...base, method, breathsPerMinute: null, refusal: null, dangerSigns: ['vomits-everything'] })).toEqual({
        ...base,
        method,
        breathsPerMinute: null,
        outcome: 'urgent',
        refusal: 'not-counted',
        dangerSigns: ['vomits-everything'],
        sample: false,
      })
    }
  })

  it('saves fast breathing under 2 months as URGENT', () => {
    expect(buildHingaCheck({ ...base, ageMonths: 1, breathsPerMinute: 60 })).toMatchObject({ outcome: 'urgent', dangerSigns: [] })
    expect(buildHingaCheck({ ...base, ageMonths: 2, breathsPerMinute: 50 })).toMatchObject({ outcome: 'fast' })
  })

  it('saves a refused check with its reason, and drops the reason when there is a count', () => {
    expect(buildHingaCheck({ ...base, breathsPerMinute: null, refusal: 'motion' })).toMatchObject({ outcome: 'refused', refusal: 'motion' })
    expect(buildHingaCheck({ ...base, breathsPerMinute: null, refusal: null })).toMatchObject({ refusal: 'not-counted' })
    expect(buildHingaCheck({ ...base, refusal: 'motion' })).toMatchObject({ outcome: 'fast', refusal: null })
  })

  it('records how the breaths were counted', () => {
    expect(buildHingaCheck(base)).toMatchObject({ method: 'camera' })
    expect(buildHingaCheck({ ...base, method: 'hand', breathsPerMinute: 44 })).toMatchObject({ method: 'hand', outcome: 'fast', refusal: null })
  })

  it('saves nothing outside the IMCI age range', () => {
    expect(buildHingaCheck({ ...base, ageMonths: 60 })).toBeNull()
  })
})

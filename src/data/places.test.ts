import { describe, expect, it } from 'vitest'
import { BARANGAY_PATTERN, MUNICIPALITY_PATTERN } from '../qr/schema'
import { DEMO_BARANGAYS, DEMO_MUNICIPALITY, barangayCode, barangayName } from './places'

describe('demo places', () => {
  it('uses codes the QR schema accepts, each under the municipality', () => {
    expect(MUNICIPALITY_PATTERN.test(DEMO_MUNICIPALITY.code)).toBe(true)
    for (const place of DEMO_BARANGAYS) {
      expect(BARANGAY_PATTERN.test(place.code)).toBe(true)
      expect(place.code.startsWith(`${DEMO_MUNICIPALITY.code}-`)).toBe(true)
    }
  })

  it('has unique names and codes', () => {
    expect(new Set(DEMO_BARANGAYS.map((p) => p.code)).size).toBe(DEMO_BARANGAYS.length)
    expect(new Set(DEMO_BARANGAYS.map((p) => p.name)).size).toBe(DEMO_BARANGAYS.length)
  })

  it('maps names and codes both ways', () => {
    expect(barangayCode('Maligaya-D')).toBe('SID-MAL')
    expect(barangayName('SID-RIV')).toBe('Riverside-D')
    expect(barangayCode('Nowhere')).toBeNull()
  })
})

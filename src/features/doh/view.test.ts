import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createPayload, type RawCounts } from '../../qr'
import type { ReportsResponse } from '../../../server/protocol'
import { Reports } from './DohPage'
import { dohView, rowCells, savedCode } from './view'

// The DOH view's cells and table, from a synthetic /api/reports answer.

const RAW: RawCounts = {
  exposed: { under2m: 0, m2to12: 2, y1to5: 9, y5to17: 21, y18to59: 40, y60plus: 6 },
  inWatchWindow: 3,
  fastBreathing: { under2m: 0, m2to12: 1, y1to5: 5 },
  urgentReferrals: 0,
  doxyCapsulesOnHand: 40,
  doxyCapsulesExpiring6w: 30,
  clinicianReviewFlags: 2,
}
const counts = (barangay: string, epiWeek = '2026-W41') => createPayload({ municipality: 'SID', barangay, epiWeek, seq: 1, counts: RAW }).counts

const RESPONSE: ReportsResponse = {
  ok: true,
  municipality: 'SID',
  rows: [
    { barangay: 'SID-BGS', epiWeek: '2026-W40', seq: 4, counts: counts('SID-BGS', '2026-W40'), receivedAt: '2026-10-10T01:00:00.000Z', receivedFrom: '3F2A-91C0-7B1E-04D2', phoneFingerprint: 'AAAA-BBBB-CCCC-DDDD' },
    { barangay: 'SID-MAL', epiWeek: '2026-W41', seq: 2, counts: counts('SID-MAL'), receivedAt: '2026-10-10T01:00:00.000Z', receivedFrom: '3F2A-91C0-7B1E-04D2', phoneFingerprint: 'EEEE-FFFF-0000-1111' },
  ],
  totals: {
    epiWeek: '2026-W41',
    barangays: 1,
    counts: {
      exposed: { under2m: { min: 0, max: 0 }, m2to12: { min: 1, max: 4 }, y1to5: { min: 9, max: 9 }, y5to17: { min: 21, max: 21 }, y18to59: { min: 40, max: 40 }, y60plus: { min: 6, max: 6 } },
      inWatchWindow: { min: 1, max: 4 },
      fastBreathing: { under2m: { min: 0, max: 0 }, m2to12: { min: 1, max: 4 }, y1to5: { min: 5, max: 5 } },
      urgentReferrals: { min: 0, max: 0 },
      doxyCapsulesOnHand: { min: 40, max: 40 },
      doxyCapsulesExpiring6w: { min: 30, max: 30 },
      clinicianReviewFlags: { min: 1, max: 4 },
    },
  },
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim()

describe('DOH view', () => {
  it('keeps "<5" in single cells and shows band sums as ranges', () => {
    expect(rowCells(counts('SID-MAL'))).toEqual({
      exposed: '77–80',
      inWatchWindow: '<5',
      fastBreathing: '6–9',
      urgentReferrals: '0',
      doxyOnHand: '40',
      doxyExpiring: '30',
      flags: '<5',
    })
  })

  it('marks a barangay whose latest report is from an earlier week, and totals the newest week', () => {
    const view = dohView(RESPONSE, new Date('2026-10-10T02:00:00.000Z'))
    expect(view.rows.map((row) => [row.name, row.week, row.olderWeek])).toEqual([
      ['Bagong Silang-D', '2026-W40', true],
      ['Maligaya-D', '2026-W41', false],
    ])
    expect(view.totals).toMatchObject({ week: '2026-W41', barangays: 1, cells: { exposed: '77–80', inWatchWindow: '1–4', flags: '1–4' } })
    const shown = text(renderToStaticMarkup(createElement(Reports, { view })))
    expect(shown).toContain('Barangay Week Exposed, watch not started yet In watch window Fast-breathing referrals Urgent referrals')
    expect(shown).toContain('Bagong Silang-D 2026-W40 Earlier week 77–80 <5 6–9 0 40 30 <5')
    expect(shown).toContain('3F2A-91C0-7B1E-04D2')
    expect(shown).toContain('Total, 1 barangay 2026-W41 77–80 1–4 6–9 0 40 30 1–4')
  })

  it('says when no barangay has reported yet', () => {
    const shown = text(renderToStaticMarkup(createElement(Reports, { view: dohView({ ...RESPONSE, rows: [], totals: null }) })))
    expect(shown).toContain('No barangay reports yet')
  })

  it("keeps the code out of the way when this browser has no sessionStorage", () => {
    expect(savedCode.get()).toBeNull()
    expect(() => savedCode.set('x')).not.toThrow()
  })
})

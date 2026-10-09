import 'fake-indexeddb/auto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { openAgapayDb } from '../../data/db/db'
import { buildPlan, planTemplateText, type MunicipalPlan } from '../../rules/plan'
import { loadMunicipalSample, readHandoff, readPlanInputs } from './municipal'
import { MergedTable, Moves, PlanEditor, Priority } from './PlanPage'
import { Slots } from './ScanPage'

// A render check of the plain screens with the sample barangays (no browser
// on the build laptop; the live URL is checked by hand).

async function sampleState() {
  const db = await openAgapayDb('municipal-screens-test')
  await loadMunicipalSample(db, new Date('2026-10-09T08:30:00.000Z'))
  const handoff = await readHandoff(db)
  const inputs = await readPlanInputs(db)
  db.close()
  const result = buildPlan(inputs.payloads, { sampleBarangays: inputs.sampleBarangays })
  if (!result.ok) throw new Error(result.code)
  return { handoff, plan: result.plan }
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('municipal screens', () => {
  it('show the 5 slots: 4 sample barangays received, Maligaya-D waiting for pairing', async () => {
    const { handoff } = await sampleState()
    const html = text(renderToStaticMarkup(createElement(Slots, handoff)))
    expect(html).toContain('4 of 5 received.')
    expect(html).toContain('Maligaya-D (SID-MAL) No phone paired yet: scan its pairing QR first. Waiting for its QR.')
    expect(html).toMatch(/Bagong Silang-D \(SID-BGS\) · Sample data Phone paired, fingerprint [0-9A-F-]{19}\. Received export 3, week 2026-W41/)
  })

  it('show the merged table, the order with its reasons, and the move', async () => {
    const { plan } = await sampleState()
    const table = text(renderToStaticMarkup(createElement(MergedTable, { plan })))
    expect(table).toContain('Bagong Silang-D (sample data) 2026-W41 3 142–145 64 9–15 5 10 0 12')
    expect(table).toContain('All 4 238–256 103–106 17–32 6–9 144 30 18–21')
    const priority = text(renderToStaticMarkup(createElement(Priority, { plan })))
    expect(priority).toContain(
      'Bagong Silang-D : score 97–109 Why: 5 urgent danger-sign referrals ×3 = 15; 9–15 fast-breathing referrals (Hinga) ×2 = 18–30; 64 residents in the watch window ×1 = 64.',
    )
    const moves = text(renderToStaticMarkup(createElement(Moves, { plan })))
    expect(moves).toContain('Riverside-D to Bagong Silang-D : up to 30 capsules that expire within 6 weeks.')
    expect(moves).toContain('Bagong Silang-D is 1st by residents in the watch window (64) and 1st by fewest capsules on hand (10).')
    expect(moves).toContain('never a dose')
  })

  it('put the template text in the editor', async () => {
    const { plan } = await sampleState()
    const draft = planTemplateText(plan as MunicipalPlan, 'San Isidro Demo')
    const html = renderToStaticMarkup(createElement(PlanEditor, { plan, draft }))
    expect(html).toContain('Draft plan for week 2026-W41, San Isidro Demo (SID)')
    expect(html).toContain('Approve plan')
  })
})

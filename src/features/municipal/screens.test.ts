import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CheckedWording } from './CheckedWording'
import { LogTable } from './LogPage'
import { MergedTable } from './MergedPage'
import { mergedView } from './merged'
import { PlanBody, PlanSteps, type WordingPanel } from './PlanPage'
import { sampleState, SAMPLE_NOW } from './testSample'

// SSR render checks do not start the PWA runtime or resolve its virtual module.
vi.mock('../../lib/useHoldReload', () => ({ useHoldReload: () => {} }))
vi.mock('../../lib/appShell', () => ({ useShellStatus: () => 'ready' }))

// Render checks of the laptop screens' parts with the sample barangays (no
// browser on the build laptop; the live URL is checked by hand).

const text = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')

describe('laptop screens', () => {
  it('18: the merged table, with Maligaya-D waiting, ranges with en dashes, and the total row', async () => {
    const { handoff, plan } = await sampleState()
    const html = renderToStaticMarkup(createElement(MergedTable, { view: mergedView(plan, handoff.received, { now: SAMPLE_NOW }) }))
    const table = text(html)
    expect(table).toContain(
      'Barangay Received Exposed, watch not started yet In watch window Fast-breathing referrals Doxycycline on hand Expiring in 6 weeks',
    )
    expect(table).toContain('Maligaya-D Waiting – – – – –')
    expect(table).toMatch(/Bagong Silang-D Priority \d{1,2}:\d{2} [AP]M · #3 142–145 6 0 10 0/)
    expect(table).toContain('4 of 5 barangays 238–256 6 0 144 30')
    expect(html).not.toContain('<a ') // rows open nothing (the detail isn't designed)
  })

  it('19a: the steps, the dose note, an empty wording box and Approve; the AI panel slot gets the plan and template', async () => {
    const { plan } = await sampleState()
    const steps = text(renderToStaticMarkup(createElement(PlanSteps, { plan })))
    expect(steps).toContain('1. Send a doctor team to Bagong Silang-D first.')
    expect(steps).toContain('2. Move 30 capsules from Riverside-D to Bagong Silang-D.')
    expect(steps).toContain('No doses. Doxycycline is given only after consultation with a health professional (DOH guideline).')

    const seen: { plan?: unknown; draft?: string } = {}
    const FakePanel: WordingPanel = (props) => {
      seen.plan = props.plan
      seen.draft = props.draft
      return createElement('section', { 'data-panel': '' }, 'Wording panel here', props.children)
    }
    const body = renderToStaticMarkup(createElement(PlanBody, { plan, wordingPanel: FakePanel }))
    // The officer's box sits inside the panel's card.
    expect(body).toMatch(/<section data-panel="">Wording panel here<div[^>]*>.*<textarea[^>]*>.*<\/section>/)
    // Before an AI draft, the box has its visible label (19d).
    expect(text(body)).toContain('Wording (optional)')
    expect(body).toMatch(/<label for="([^"]+)"[^>]*>Wording.*<textarea id="\1"/)
    expect(text(body)).toContain('Approved by Municipal health officer')
    expect(text(body)).toContain('Approve plan')
    expect(seen.plan).toBe(plan)
    expect(seen.draft).toContain('Draft plan for week 2026-W41, San Isidro Demo (SID)')

    // Without the AI panel the box is there on its own, and the plan is complete.
    const alone = renderToStaticMarkup(createElement(PlanBody, { plan }))
    expect(text(alone)).toContain('Wording (optional)')
    expect(text(alone)).toContain('Approve plan')
  })

  it('19a mismatch: the new number gets an outline mark with an icon, and the line names it', () => {
    const html = renderToStaticMarkup(
      createElement(CheckedWording, { value: 'Move 45 capsules to Bagong Silang-D.', onChange: () => {}, reference: 'Move 30 capsules.' }),
    )
    expect(html).toMatch(/<mark[^>]*>45<span[^>]*><svg/)
    expect(text(html)).toContain("1 number doesn't match the plan: 45")
  })

  it('20: the log table, newest first, with the role and where the wording came from', () => {
    const html = renderToStaticMarkup(
      createElement(LogTable, {
        rows: [
          {
            id: 'a',
            day: 'Sat, Oct 10',
            time: '9:31 AM',
            approver: 'Municipal health officer',
            plan: '1. Doctor team to Bagong Silang-D first.',
            from: '5 of 5 barangays',
            week: '2026-W41',
            wording: 'AI draft, edited',
          },
        ],
      }),
    )
    expect(text(html)).toContain(
      'When Approved by Plan From Wording Sat, Oct 10 9:31 AM Municipal health officer 1. Doctor team to Bagong Silang-D first. 5 of 5 barangays 2026-W41 AI draft, edited',
    )
  })
})

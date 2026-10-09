import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MessagesView } from './MessagesCard'

// Render checks of the phone's messages card in each state.

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()

describe('Messages from the municipality', () => {
  it('shows each approved message as plain text, who approved it, and when it was checked', () => {
    const shown = text(
      renderToStaticMarkup(
        createElement(MessagesView, {
          load: {
            status: 'ready',
            checkedAt: '2026-10-10T01:05:00.000Z',
            alerts: [
              {
                id: '4',
                kind: 'watch',
                barangay: 'SID-RIV',
                epiWeek: '2026-W41',
                text: 'Riverside-D has 7 residents in the leptospirosis watch window this week.',
                approvedAt: '2026-10-10T01:00:00.000Z',
                approvedByRole: 'Provincial health officer',
              },
            ],
          },
        }),
      ),
    )
    expect(shown).toMatch(/^Messages from the municipality Riverside-D has 7 residents/)
    expect(shown).toContain('Approved by Provincial health officer')
    expect(shown).toMatch(/Checked \S+/)
  })

  it('says what to do before the phone is paired or linked', () => {
    expect(text(renderToStaticMarkup(createElement(MessagesView, { load: { status: 'not-paired' } })))).toContain('once this phone is paired')
    expect(text(renderToStaticMarkup(createElement(MessagesView, { load: { status: 'not-linked' } })))).toContain("syncs this phone's pairing")
    expect(text(renderToStaticMarkup(createElement(MessagesView, { load: { status: 'ready', alerts: [], checkedAt: '2026-10-10T01:05:00.000Z' } })))).toContain(
      'No messages.',
    )
  })
})

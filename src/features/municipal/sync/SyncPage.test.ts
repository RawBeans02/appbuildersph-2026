import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InboxList } from './Inbox'
import { LastSyncTable } from './SyncPage'

// Render check of the last sync's table (no browser on the build laptop).

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()

describe('Sync screen', () => {
  it('lists each barangay with its key and report result', () => {
    const html = renderToStaticMarkup(
      createElement(LastSyncTable, {
        last: {
          id: 'lastSync',
          at: '2026-10-10T01:00:00.000Z',
          rows: [
            { barangay: 'SID-MAL', name: 'Maligaya-D', key: 'Sent', report: 'Week 2026-W41 #3 uploaded', tone: 'ok' },
            { barangay: 'SID-RIV', name: 'Riverside-D', key: 'Sent', report: 'Week 2026-W41 #1 not sent: not signed by the paired phone', tone: 'bad' },
          ],
        },
      }),
    )
    const shown = text(html)
    expect(shown).toContain('Last sync, by barangay')
    expect(shown).toContain('Barangay Phone key Report')
    expect(shown).toContain('Maligaya-D Sent Week 2026-W41 #3 uploaded')
    expect(shown).toContain('Riverside-D Sent Week 2026-W41 #1 not sent: not signed by the paired phone')
    expect(html.match(/<th scope="row">/g)).toHaveLength(2)
  })

  it('lists the inbox as plain text, with who approved it', () => {
    const html = renderToStaticMarkup(
      createElement(InboxList, {
        alerts: [
          {
            id: '3',
            kind: 'move-stock',
            barangay: 'SID-BGS',
            epiWeek: '2026-W41',
            text: 'Move up to 30 doxycycline capsules from Bagong Silang-D to Maligaya-D.',
            approvedAt: '2026-10-10T01:00:00.000Z',
            approvedByRole: 'Provincial health officer',
          },
        ],
      }),
    )
    const shown = text(html)
    expect(shown).toContain('Stock move, Bagong Silang-D: Move up to 30 doxycycline capsules from Bagong Silang-D to Maligaya-D.')
    expect(shown).toContain('Approved by Provincial health officer')
    expect(text(renderToStaticMarkup(createElement(InboxList, { alerts: [] })))).toBe('No approved alerts yet.')
  })

  it('says when there was nothing to send', () => {
    const html = renderToStaticMarkup(createElement(LastSyncTable, { last: { id: 'lastSync', at: '2026-10-10T01:00:00.000Z', rows: [] } }))
    expect(text(html)).toContain('Nothing to send yet')
  })
})

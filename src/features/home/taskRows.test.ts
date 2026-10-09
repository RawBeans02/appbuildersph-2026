import { describe, expect, it } from 'vitest'
import type { HomeSummary } from './summary'
import { breathingLine, taskRows, type TaskInputs } from './taskRows'

const TODAY = '2026-10-10'

const quiet: HomeSummary = {
  flood: null,
  watch: { active: 0, upcoming: 0, higherRisk: 0, nextStart: null },
  hingaThisWeek: { fast: 0, urgent: 0, refused: 0, referred: 0, lastReferredAt: null },
  doxycycline: { onHand: 0, expiringSoon: 0, expired: 0 },
  openFlags: 0,
  modelsPrepared: true,
}

type Overrides = {
  [K in keyof HomeSummary]?: HomeSummary[K] extends object | null ? Partial<NonNullable<HomeSummary[K]>> : HomeSummary[K]
}

function summary(overrides: Overrides = {}): HomeSummary {
  return {
    ...quiet,
    modelsPrepared: overrides.modelsPrepared === undefined ? quiet.modelsPrepared : overrides.modelsPrepared,
    openFlags: overrides.openFlags ?? quiet.openFlags,
    watch: { ...quiet.watch, ...overrides.watch },
    hingaThisWeek: { ...quiet.hingaThisWeek, ...overrides.hingaThisWeek },
    doxycycline: { ...quiet.doxycycline, ...overrides.doxycycline },
  }
}

const rows = (overrides: Overrides = {}, extra: Partial<TaskInputs> = {}) =>
  taskRows({ summary: summary(overrides), instructions: null, justReceived: false, today: TODAY, aiBytes: 55_100_000, ...extra })

const keys = (list: ReturnType<typeof rows>) => list.map((row) => row.key)
const row = (list: ReturnType<typeof rows>, key: string) => list.find((r) => r.key === key)

describe('taskRows', () => {
  it("shows every row in the brief's fixed order when the records call for it", () => {
    const list = rows(
      {
        modelsPrepared: false,
        watch: { active: 9, higherRisk: 2 },
        doxycycline: { onHand: 40, expiringSoon: 30, expired: 10 },
        openFlags: 1,
      },
      { instructions: { receivedAt: new Date(2026, 9, 9, 22, 45).toISOString(), actions: 2 } },
    )
    expect(keys(list)).toEqual(['ai', 'instructions', 'watch', 'expired', 'expiring', 'flag', 'send'])
    expect(list.map(({ title, meta }) => [title, meta])).toEqual([
      [
        'Get ready for no signal',
        'Download the AI once on Wi-Fi: 55.1 MB. Then the breathing check and the box reader work offline.',
      ],
      ['Instructions from the RHU', 'Received Fri, Oct 9, 10:45 PM · 2 actions'],
      ['9 people in the watch window today', '2 higher risk · Ask about fever, muscle pain or red eyes.'],
      ['10 capsules are past expiry', 'Set aside, not counted as on hand.'],
      ['30 doxycycline capsules expire within 6 weeks', 'Use these first · 40 on hand'],
      ['1 flag waiting for clinician review', 'It goes in the next QR as a count.'],
      ["Send this week's counts to the RHU", 'Week 2026-W41 · only counts leave, by QR'],
    ])
  })

  it('opens the right screens, and the instructions row opens its sheet', () => {
    const list = rows(
      { modelsPrepared: false, watch: { active: 1 }, doxycycline: { onHand: 1, expired: 1 }, openFlags: 2 },
      { instructions: { receivedAt: '2026-10-09T14:45:00.000Z', actions: 1 } },
    )
    expect(list.map((r) => [r.key, r.to])).toEqual([
      ['ai', '/prepare'],
      ['instructions', null],
      ['watch', '/watch'],
      ['expired', '/stock'],
      ['expiring', '/stock'],
      ['flag', '/compare'],
      ['send', '/send'],
    ])
    expect(list.map((r) => [r.icon, r.tone])).toEqual([
      ['download', 'neutral'],
      ['instructions', 'neutral'],
      ['people', 'neutral'],
      ['expired', 'bad'],
      ['stock', 'neutral'],
      ['flag', 'neutral'],
      ['send', 'neutral'],
    ])
  })

  it('shows only the send row when nothing else calls for one', () => {
    expect(keys(rows())).toEqual(['send'])
  })

  it('shows the AI row only when the cache says the AI is not downloaded', () => {
    expect(keys(rows({ modelsPrepared: false }))).toContain('ai')
    expect(keys(rows({ modelsPrepared: true }))).not.toContain('ai')
    // Still checking the cache: not known, so no row.
    expect(keys(rows({ modelsPrepared: null }))).not.toContain('ai')
    expect(row(rows({ modelsPrepared: false }, { aiBytes: 123_456_789 }), 'ai')?.meta).toContain(': 123.5 MB.')
  })

  it('shows the instructions row whenever instructions are saved, "just now" on the visit after saving', () => {
    const saved = { instructions: { receivedAt: new Date(2026, 9, 10, 10, 52).toISOString(), actions: 1 } }
    expect(row(rows({}, saved), 'instructions')?.meta).toBe('Received Sat, Oct 10, 10:52 AM · 1 action')
    expect(row(rows({}, { ...saved, justReceived: true }), 'instructions')?.meta).toBe('Received just now · 1 action')
    expect(keys(rows({}, { justReceived: true }))).not.toContain('instructions')
  })

  it('writes the watch row for one person, for many, and without a higher-risk count', () => {
    expect(row(rows({ watch: { active: 1, higherRisk: 1 } }), 'watch')).toMatchObject({
      title: '1 person in the watch window today',
      meta: '1 higher risk · Ask about fever, muscle pain or red eyes.',
    })
    expect(row(rows({ watch: { active: 9 } }), 'watch')?.meta).toBe('Ask about fever, muscle pain or red eyes.')
  })

  it('writes who starts their watch when nobody is in the window yet', () => {
    expect(row(rows({ watch: { upcoming: 3, nextStart: '2026-10-15' } }), 'watch')).toMatchObject({
      title: '3 people start their watch Thu, Oct 15',
      meta: 'Their watch window opens on day 5 after the flood.',
    })
    expect(row(rows({ watch: { upcoming: 1, nextStart: '2026-10-15' } }), 'watch')?.title).toBe(
      '1 person starts their watch Thu, Oct 15',
    )
    // People in the window come first; the upcoming ones don't get a row.
    expect(row(rows({ watch: { active: 2, upcoming: 3, nextStart: '2026-10-15' } }), 'watch')?.title).toBe(
      '2 people in the watch window today',
    )
    expect(keys(rows({ watch: { upcoming: 0 } }))).not.toContain('watch')
  })

  it('writes the expired row only when capsules are past expiry', () => {
    expect(row(rows({ doxycycline: { expired: 1 } }), 'expired')?.title).toBe('1 capsule is past expiry')
    expect(row(rows({ doxycycline: { expired: 10 } }), 'expired')?.title).toBe('10 capsules are past expiry')
    expect(keys(rows({ doxycycline: { onHand: 40 } }))).not.toContain('expired')
  })

  it('writes the expiring row, or the on-hand row when none expire soon', () => {
    expect(row(rows({ doxycycline: { onHand: 1, expiringSoon: 1 } }), 'expiring')).toMatchObject({
      icon: 'expiring',
      tone: 'warn',
      title: '1 doxycycline capsule expires within 6 weeks',
      meta: 'Use these first · 1 on hand',
    })
    expect(row(rows({ doxycycline: { onHand: 40 } }), 'expiring')).toMatchObject({
      icon: 'stock',
      tone: 'neutral',
      title: '40 doxycycline capsules on hand',
      meta: 'None expire within 6 weeks.',
    })
    expect(row(rows({ doxycycline: { onHand: 1 } }), 'expiring')?.title).toBe('1 doxycycline capsule on hand')
    // Nothing on hand and nothing expiring: no stock row.
    expect(keys(rows({ doxycycline: { onHand: 0, expired: 4 } }))).not.toContain('expiring')
  })

  it('writes the flag row in the singular and the plural', () => {
    expect(row(rows({ openFlags: 1 }), 'flag')).toMatchObject({
      title: '1 flag waiting for clinician review',
      meta: 'It goes in the next QR as a count.',
    })
    expect(row(rows({ openFlags: 3 }), 'flag')).toMatchObject({
      title: '3 flags waiting for clinician review',
      meta: 'They go in the next QR as a count.',
    })
    expect(keys(rows({ openFlags: 0 }))).not.toContain('flag')
  })

  it("names today's ISO week on the send row", () => {
    expect(row(rows({}, { today: '2027-01-01' }), 'send')?.meta).toBe('Week 2026-W53 · only counts leave, by QR')
    expect(row(rows({}, { today: '2026-10-12' }), 'send')?.meta).toBe('Week 2026-W42 · only counts leave, by QR')
  })
})

describe('breathingLine', () => {
  const lastAt = new Date(2026, 9, 6, 9, 30).toISOString()

  it('is not shown without a referral this week', () => {
    expect(breathingLine(summary())).toBeNull()
    expect(breathingLine(summary({ hingaThisWeek: { refused: 2 } }))).toBeNull()
  })

  it('writes the referrals in the singular and the plural, with the last day', () => {
    expect(breathingLine(summary({ hingaThisWeek: { fast: 1, referred: 1, lastReferredAt: lastAt } }))).toEqual({
      referred: '1 child referred this week after a breathing check · last Tue, Oct 6',
      urgent: null,
    })
    expect(breathingLine(summary({ hingaThisWeek: { fast: 2, urgent: 1, referred: 3, lastReferredAt: lastAt } }))).toEqual({
      referred: '3 children referred this week after a breathing check · last Tue, Oct 6',
      urgent: '1 of them URGENT',
    })
  })
})

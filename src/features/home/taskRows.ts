import { isoWeek } from '../../qr'
import { dateTime, formatMB, weekdayMonthDay, weekdayMonthDayAt } from '../../lib/format'
import type { HomeSummary } from './summary'

// Home's "Today" list (design pass 2, 1e/1f/1g): one task sentence per row,
// with its number inside. A row shows only when its records call for it, in
// the brief's fixed order. Pure, so the rules and the plurals are tested.

export type TaskIcon = 'download' | 'instructions' | 'people' | 'expired' | 'expiring' | 'stock' | 'flag' | 'send'

export type TaskRow = {
  key: 'ai' | 'instructions' | 'watch' | 'expired' | 'expiring' | 'flag' | 'send'
  icon: TaskIcon
  // The 40 px circle: --sunken, or the status tint.
  tone: 'neutral' | 'bad' | 'warn'
  title: string
  meta: string
  // Where the row goes; null opens the instructions sheet (1g).
  to: string | null
}

export type SavedInstructions = { receivedAt: string; actions: number }

export type TaskInputs = {
  summary: HomeSummary
  // The instructions saved from the RHU's return QR, if any.
  instructions: SavedInstructions | null
  // This Home visit came straight from saving them on /receive.
  justReceived: boolean
  // Today on this phone's calendar (YYYY-MM-DD).
  today: string
  // The phone models' real download size, in bytes.
  aiBytes: number
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const localDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function taskRows({ summary, instructions, justReceived, today, aiBytes }: TaskInputs): TaskRow[] {
  const rows: TaskRow[] = []
  const { watch, doxycycline: doxy } = summary

  // 1f: only when the cache says the phone's AI isn't downloaded (null is
  // "not known yet", so no row).
  if (summary.modelsPrepared === false) {
    rows.push({
      key: 'ai',
      icon: 'download',
      tone: 'neutral',
      title: 'Get ready for no signal',
      meta: `Download the AI once on Wi-Fi: ${formatMB(aiBytes)}. Then the breathing check and the box reader work offline.`,
      to: '/prepare',
    })
  }

  // 1g: whenever instructions are saved (there is no "opened" flag).
  if (instructions) {
    const received = justReceived ? 'just now' : dateTime(instructions.receivedAt)
    rows.push({
      key: 'instructions',
      icon: 'instructions',
      tone: 'neutral',
      title: 'Instructions from the RHU',
      meta: `Received ${received} · ${count(instructions.actions, 'action', 'actions')}`,
      to: null,
    })
  }

  if (watch.active > 0) {
    const ask = 'Ask about fever, muscle pain or red eyes.'
    rows.push({
      key: 'watch',
      icon: 'people',
      tone: 'neutral',
      title: `${count(watch.active, 'person', 'people')} in the watch window today`,
      meta: watch.higherRisk > 0 ? `${watch.higherRisk} higher risk · ${ask}` : ask,
      to: '/watch',
    })
  } else if (watch.upcoming > 0 && watch.nextStart) {
    rows.push({
      key: 'watch',
      icon: 'people',
      tone: 'neutral',
      title: `${watch.upcoming === 1 ? '1 person starts' : `${watch.upcoming} people start`} their watch ${weekdayMonthDay(watch.nextStart)}`,
      meta: 'Their watch window opens on day 5 after the flood.',
      to: '/watch',
    })
  }

  if (doxy.expired > 0) {
    rows.push({
      key: 'expired',
      icon: 'expired',
      tone: 'bad',
      title: `${doxy.expired === 1 ? '1 capsule is' : `${doxy.expired} capsules are`} past expiry`,
      meta: 'Set aside, not counted as on hand.',
      to: '/stock',
    })
  }

  if (doxy.expiringSoon > 0) {
    rows.push({
      key: 'expiring',
      icon: 'expiring',
      tone: 'warn',
      title: `${doxy.expiringSoon === 1 ? '1 doxycycline capsule expires' : `${doxy.expiringSoon} doxycycline capsules expire`} within 6 weeks`,
      meta: `Use these first · ${doxy.onHand} on hand`,
      to: '/stock',
    })
  } else if (doxy.onHand > 0) {
    rows.push({
      key: 'expiring',
      icon: 'stock',
      tone: 'neutral',
      title: `${count(doxy.onHand, 'doxycycline capsule', 'doxycycline capsules')} on hand`,
      meta: 'None expire within 6 weeks.',
      to: '/stock',
    })
  }

  if (summary.openFlags > 0) {
    rows.push({
      key: 'flag',
      icon: 'flag',
      tone: 'neutral',
      title: `${count(summary.openFlags, 'flag', 'flags')} waiting for clinician review`,
      meta: `${summary.openFlags === 1 ? 'It goes' : 'They go'} in the next QR as a count.`,
      to: '/compare',
    })
  }

  rows.push({
    key: 'send',
    icon: 'send',
    tone: 'neutral',
    title: "Send this week's counts to the RHU",
    meta: `Week ${isoWeek(localDate(today))} · only counts leave, by QR`,
    to: '/send',
  })

  return rows
}

// The breathing line under the rows (not a task row): this ISO week's
// referrals after a breathing check, and how many of them were URGENT.
export function breathingLine(summary: HomeSummary): { referred: string; urgent: string | null } | null {
  const { referred, urgent, lastReferredAt } = summary.hingaThisWeek
  if (referred === 0) return null
  const last = lastReferredAt ? ` · last ${weekdayMonthDayAt(lastReferredAt)}` : ''
  return {
    referred: `${count(referred, 'child', 'children')} referred this week after a breathing check${last}`,
    urgent: urgent > 0 ? `${urgent} of them URGENT` : null,
  }
}

import type { ExposureKind } from '../../data/db/types'
import { weekdayMonthDayPlain } from '../../lib/format'

// The Watch screens' words (design/COPY.md, 8 and 9), filled from records.

const KIND_WORDS: Record<ExposureKind, string> = { waded: 'waded', 'open-wound': 'open wound', repeated: 'repeated' }

// "waded, open wound"
export const kindWords = (kinds: ExposureKind[]) => kinds.map((kind) => KIND_WORDS[kind]).join(', ')

// 9b's "Higher: {repeated contact}" / "Higher: {open wound}", or null.
export function higherRiskWords(kinds: ExposureKind[]): string | null {
  const reasons = [kinds.includes('open-wound') && 'open wound', kinds.includes('repeated') && 'repeated contact']
  const words = reasons.filter((reason): reason is string => !!reason)
  return words.length ? `Higher: ${words.join(', ')}` : null
}

// "9 people" / "1 person"
export const peopleWords = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`

// "3 households" / "1 household"
export const householdWords = (n: number) => `${n} ${n === 1 ? 'household' : 'households'}`

// Upcoming row: "in 5 days" / "in 1 day"
export const inDaysWords = (n: number) => `in ${n} ${n === 1 ? 'day' : 'days'}`

// 8a's date field: "Today, Sun Oct 4, 2026", or "Sat Oct 3, 2026".
export function floodDateWords(day: string, today: string): string {
  const date = `${weekdayMonthDayPlain(day)}, ${day.slice(0, 4)}`
  return day === today ? `Today, ${date}` : date
}

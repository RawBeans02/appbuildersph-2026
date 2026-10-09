import { numbersIn } from './llm/check'

// Screen 19a: the numbers in the wording, checked against the plan. The text
// is split into plain runs and numbers. A number that has any value the plan
// doesn't have is new: it can't match the plan, so it's flagged (outline and
// icon, and the amber check line names it). A number whose values are all in
// the plan is only "found": that alone doesn't prove it sits in the right
// place ("move 64 capsules" with 64 taken from another line), so it's never
// shown as matching until the AI check verifies it (TASKS.md B6).
//
// Values are read with the AI check's own numbersIn (llm/check.ts), so the
// two agree on what a number is. A week ("2026-W41"), a range ("1–4",
// "8-14") and "<5" are one number each; number words ("five", "lima") count.

export type NumberStatus = 'new' | 'found'

export type Segment = { text: string; number?: NumberStatus }

export type NumberCheck = {
  segments: Segment[]
  total: number
  // The new numbers, as written, first appearance first.
  mismatched: string[]
}

const TOKEN = /\d{4}-W\d{1,2}|<\s?\d+|\d+(?:[.,]\d+)?(?:\s?[–-]\s?\d+(?:[.,]\d+)?)?|[A-Za-z]+/g

// `reference`: the plan's own text (the rule-based template and the steps).
export function checkNumbers(text: string, reference: string): NumberCheck {
  const allowed = new Set(numbersIn(reference))
  const segments: Segment[] = []
  const mismatched: string[] = []
  let total = 0
  let plain = ''
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const values = numbersIn(match[0])
    if (values.length === 0) continue
    plain += text.slice(last, match.index)
    if (plain) segments.push({ text: plain })
    plain = ''
    const status: NumberStatus = values.every((value) => allowed.has(value)) ? 'found' : 'new'
    segments.push({ text: match[0], number: status })
    total += 1
    if (status === 'new' && !mismatched.includes(match[0])) mismatched.push(match[0])
    last = match.index + match[0].length
  }
  plain += text.slice(last)
  if (plain) segments.push({ text: plain })
  return { segments, total, mismatched }
}

// The check line under the wording, or null when it has no numbers. A
// mismatch is amber (COPY.md 19). With no new number it says only that,
// never "all numbers match".
export function checkLine(check: NumberCheck): { tone: 'warn' | 'info'; text: string } | null {
  if (check.total === 0) return null
  const wrong = check.mismatched.length
  if (wrong === 0) return { tone: 'info', text: 'No new numbers found; check each number against the plan steps' }
  return {
    tone: 'warn',
    text: `${wrong} ${wrong === 1 ? "number doesn't" : "numbers don't"} match the plan: ${check.mismatched.join(', ')}`,
  }
}

import { formatCount, formatRange, type Count, type CountRange } from '../../../qr/index.js'

// Checks a model's draft against the rule-based plan it rewords. The draft is
// offered only if every number in it is the plan's, each tied to the right
// place; it keeps every priority barangay in order with its own score; it
// keeps every stock move (from, to, amount) and invents none; and it adds no
// dose, schedule, diagnosis or barangay. Otherwise the officer keeps the
// template, with the reasons. Pure, so it's fully unit-tested.
//
// It's still a word-level check: it can't catch every rewording that changes
// the meaning, so the panel asks the officer to check each number, and the
// officer approves.

export type DraftCheck = { ok: true } | { ok: false; reasons: string[] }

// The parts of the plan the check needs (MunicipalPlan has them).
export type PlanFacts = {
  priority: readonly { name: string; score: CountRange }[]
  moves: readonly { fromName: string; toName: string; capsulesUpTo: Count }[]
}

// Number words a model might write instead of digits. "one"/"isa" are left
// out: "no one", "isa sa" are ordinary phrases.
const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  dalawa: 2, tatlo: 3, apat: 4, lima: 5, anim: 6, pito: 7, walo: 8, siyam: 9, sampu: 10,
}

const SMALL_CELL = /<\s*5/g

// A number as the check reads it: a value, or "<5" (a suppressed count of 1
// to 4), which is its own token and never allows a 5.
export type NumberValue = number | '<5'

export function numbersIn(text: string): NumberValue[] {
  const smallCells = text.match(SMALL_CELL)?.length ?? 0
  const rest = text.replace(SMALL_CELL, ' ')
  const digits = [...rest.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')))
  const words = [...rest.toLowerCase().matchAll(/[a-z]+/g)]
    .map((m) => NUMBER_WORDS[m[0]])
    .filter((n): n is number => n !== undefined)
  return [...Array<NumberValue>(smallCells).fill('<5'), ...digits, ...words]
}

// Terms the draft may not use more often than the template does: the template
// says "sets no dose" and "does not diagnose" once, so a reworded reminder is
// fine, but any other mention is added content.
const GUARDED_TERMS: [label: string, pattern: RegExp][] = [
  ['a dose', /\bdos(?:e|es|age|ing|is)\b/gi],
  ['a medicine amount (mg)', /\bmg\b|\bmilligrams?\b/gi],
  ['tablets', /\btablets?\b/gi],
  [
    'an amount per person',
    /\b(?:per|each|every|bawat|kada)\s+(?:[a-z-]+\s+){0,2}(?:persons?|people|residents?|patients?|child|children|tao|pasyente)\b/gi,
  ],
  ['a schedule', /\b(?:daily|twice|once a day|times a day|every \d+ hours|araw-araw|per day|kada araw)\b/gi],
  ['an instruction to take medicine', /\b(?:take|takes|taking|inumin|uminom)\b/gi],
  ['a diagnosis', /\bdiagnos\w*/gi],
  ['a prescription', /\b(?:prescribe\w*|prescription|reseta)\b/gi],
]

const MOVE_WORDS = /\b(?:move|moves|moving|moved|transfer\w*|send|sending|shift|ilipat|lipat)\b/i
// A stock move talks about the medicine, not a doctor team.
const STOCK_WORDS = /\b(?:capsules?|doxycycline|stock|gamot)\b/i

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

// The exact amount as a token: "30" not inside "300"; "<5" as written.
function hasAmount(sentence: string, amount: string): boolean {
  if (amount === '<5') return /<\s*5/.test(sentence)
  return new RegExp(`(?<![\\d.,])${amount}(?![\\d])`).test(sentence)
}

// A score as written: "17", or a range "14–20" (en dash or hyphen).
function scorePattern(score: CountRange): RegExp {
  const text = formatRange(score)
  const [min, max] = text.split('–')
  return max === undefined ? new RegExp(`(?<![\\d.,])${min}(?![\\d])`) : new RegExp(`(?<![\\d])${min}\\s*[–-]\\s*${max}(?![\\d])`)
}

const leftToTheMho = (sentence: string) => /\bMHO\b/.test(sentence) && /\b(?:decid\w*|approv\w*|aprubado)\b/i.test(sentence)

export function checkDraft(draft: string, template: string, plan: PlanFacts, knownNames: readonly string[]): DraftCheck {
  const reasons: string[] = []
  const text = draft.trim()
  if (text.length < 40) reasons.push('The draft is empty or too short.')

  // Numbers: each one must be a number of the plan.
  const allowed = numbersIn(template)
  const found = numbersIn(text)
  const added = [...new Set(found.filter((n) => n !== '<5' && !allowed.includes(n)))]
  if (added.length) reasons.push(`It adds numbers that are not in the plan: ${added.join(', ')}.`)
  if (found.includes('<5') && !allowed.includes('<5')) reasons.push('It adds a "<5" that is not in the plan.')

  for (const [label, pattern] of GUARDED_TERMS) {
    if (count(text, pattern) > count(template, pattern)) reasons.push(`It adds ${label}.`)
  }

  // Barangays: none from outside the plan, every priority one, in order.
  const priorityNames = plan.priority.map((entry) => entry.name)
  const strangers = knownNames.filter((name) => text.includes(name) && !template.includes(name))
  if (strangers.length) reasons.push(`It names barangays that are not in the plan: ${strangers.join(', ')}.`)
  const missing = priorityNames.filter((name) => !text.includes(name))
  if (missing.length) reasons.push(`It leaves out ${missing.join(', ')}.`)

  const firstAt = priorityNames.map((name) => text.indexOf(name))
  if (!missing.length) {
    const inOrder = firstAt.every((at, i) => i === 0 || at > firstAt[i - 1])
    if (!inOrder) reasons.push('It changes the doctor-team priority order.')
    else {
      // Each priority barangay's own score comes after its name, before the next one.
      plan.priority.forEach((entry, i) => {
        const segment = text.slice(firstAt[i], i + 1 < firstAt.length ? firstAt[i + 1] : undefined)
        if (!scorePattern(entry.score).test(segment)) {
          reasons.push(`It doesn't give ${entry.name}'s score (${formatRange(entry.score)}) next to its name.`)
        }
      })
    }
  }

  // Stock moves: each plan move, from → to in that order with its exact
  // amount, in one sentence; and no other move between two barangays.
  const parts = sentences(text)
  for (const move of plan.moves) {
    const amount = formatCount(move.capsulesUpTo)
    const keptIn = parts.filter((sentence) => {
      const from = sentence.indexOf(move.fromName)
      const to = sentence.indexOf(move.toName)
      return from >= 0 && to > from && hasAmount(sentence, amount)
    })
    if (!keptIn.length) reasons.push(`It changes or leaves out the move of up to ${amount} capsules from ${move.fromName} to ${move.toName}.`)
    // A move is a suggestion for the MHO, never an order: its sentence keeps
    // the MHO's decision ("for the MHO to decide", "if the MHO approves").
    else if (!keptIn.some(leftToTheMho)) {
      reasons.push(`It turns the move of up to ${amount} capsules from ${move.fromName} to ${move.toName} into an order; keep "for the MHO to decide".`)
    }
  }
  for (const sentence of parts) {
    if (!MOVE_WORDS.test(sentence) || !STOCK_WORDS.test(sentence)) continue
    const named = knownNames
      .map((name) => ({ name, at: sentence.indexOf(name) }))
      .filter((entry) => entry.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((entry) => entry.name)
    if (named.length < 2) continue
    const [from, to] = named
    if (!plan.moves.some((move) => move.fromName === from && move.toName === to)) {
      reasons.push(`It suggests a move from ${from} to ${to} that the plan doesn't make.`)
    }
  }

  return reasons.length ? { ok: false, reasons } : { ok: true }
}

// The template's fixed reminder, added to every draft the officer uses, so the
// no-dose, no-diagnosis line can't be lost in rewording.
export const PLAN_REMINDER =
  'Paalala: this plan does not diagnose anyone and sets no dose; doxycycline only after consultation with a health professional.'

// The template's notes that a short accepted summary leaves out: why no stock
// move is suggested, what the plan is based on, an older week, and what "<5"
// means. They're added under the draft the officer uses, so the approved text
// in the log keeps them (they come from the rules, not the model).
const NOTE_LINES = [/^No stock move suggested:/, /^Batayan \(based on\):/, /^Older week:/]
const LESS_THAN_5 = '"<5" means 1 to 4, so scores and totals that include one are ranges.'

export function withPlanNotes(draft: string, template: string): string {
  const notes = template.split('\n').filter((line) => NOTE_LINES.some((pattern) => pattern.test(line)) && !draft.includes(line))
  if (template.includes('"<5" means 1 to 4') && !draft.includes('"<5" means')) notes.push(LESS_THAN_5)
  return notes.length ? `${draft.trim()}\n\n${notes.join('\n')}` : draft
}

export function withReminder(draft: string): string {
  return draft.includes(PLAN_REMINDER) ? draft : `${draft.trim()}\n\n${PLAN_REMINDER}`
}

// Checks a model's draft against the rule-based template it rewords. The
// draft is used only if it adds no number, dose, diagnosis or barangay, and
// keeps every priority barangay in the same order; otherwise the officer gets
// the template, with the reasons. Pure, so it's fully unit-tested.

export type DraftCheck = { ok: true } | { ok: false; reasons: string[] }

// Number words a model might write instead of digits. "one"/"isa" are left
// out: "no one", "isa sa" are ordinary phrases.
const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
  dalawa: 2, tatlo: 3, apat: 4, lima: 5, anim: 6, pito: 7, walo: 8, siyam: 9, sampu: 10,
}

export function numbersIn(text: string): number[] {
  const digits = [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')))
  const words = [...text.toLowerCase().matchAll(/[a-z]+/g)]
    .map((m) => NUMBER_WORDS[m[0]])
    .filter((n): n is number => n !== undefined)
  return [...digits, ...words]
}

// Terms the draft may not use more often than the template does: the template
// says "sets no dose" and "does not diagnose" once, so a reworded reminder is
// fine, but any other mention is added content.
const GUARDED_TERMS: [label: string, pattern: RegExp][] = [
  ['a dose', /\bdos(?:e|es|age|ing|is)\b/gi],
  ['a medicine amount (mg)', /\bmg\b|\bmilligrams?\b/gi],
  ['tablets', /\btablets?\b/gi],
  ['an amount per person', /\b(?:per|each|bawat|kada)\s+(?:person|resident|patient|tao|pasyente)\b/gi],
  ['a schedule', /\b(?:daily|twice|once a day|times a day|every \d+ hours|araw-araw|per day|kada araw)\b/gi],
  ['an instruction to take medicine', /\b(?:take|takes|taking|inumin|uminom)\b/gi],
  ['a diagnosis', /\bdiagnos\w*/gi],
  ['a prescription', /\b(?:prescribe\w*|prescription|reseta)\b/gi],
]

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0

function firstMentionOrder(text: string, names: readonly string[]): string[] {
  return names
    .map((name) => ({ name, at: text.indexOf(name) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.name)
}

export function checkDraft(
  draft: string,
  template: string,
  // The plan's barangays in priority order, and every known barangay name.
  names: { priority: readonly string[]; known: readonly string[] },
): DraftCheck {
  const reasons: string[] = []
  const text = draft.trim()
  if (text.length < 40) reasons.push('The draft is empty or too short.')

  const allowed = new Set(numbersIn(template))
  const added = [...new Set(numbersIn(text).filter((n) => !allowed.has(n)))]
  if (added.length) reasons.push(`It adds numbers that are not in the plan: ${added.join(', ')}.`)

  for (const [label, pattern] of GUARDED_TERMS) {
    if (count(text, pattern) > count(template, pattern)) reasons.push(`It adds ${label}.`)
  }

  const strangers = names.known.filter((name) => text.includes(name) && !template.includes(name))
  if (strangers.length) reasons.push(`It names barangays that are not in the plan: ${strangers.join(', ')}.`)

  const missing = names.priority.filter((name) => !text.includes(name))
  if (missing.length) reasons.push(`It leaves out ${missing.join(', ')}.`)
  else if (firstMentionOrder(text, names.priority).join('|') !== names.priority.join('|')) {
    reasons.push('It changes the doctor-team priority order.')
  }

  return reasons.length ? { ok: false, reasons } : { ok: true }
}

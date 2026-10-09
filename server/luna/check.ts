import { countRange } from '../../src/qr/index.js'
import { DEMO_BARANGAYS } from '../../src/data/places.js'
import { checkDraft, type DraftCheck, type PlanFacts } from '../../src/features/municipal/llm/check.js'
import { knownNames, type AlertFacts } from './facts.js'

// An alert's wording is checked with the same positional check the laptop's
// AI wording panel uses (src/features/municipal/llm/check.ts): every number
// must be one of the template's, the barangay's own number must sit next to
// its name, a stock move keeps its from, to and amount in one sentence, and
// no dose, schedule, diagnosis, prescription or other barangay may be added.
// It's a word-level check, so a person still approves every alert.
//
// Before it, two hard refusals the word-level check can't see through:
// - characters outside the templates' own alphabet. A fullwidth "０９１７", a
//   zero-width space or a Cyrillic look-alike would slip past checks that
//   read ASCII digits and names; the templates never use them, so the
//   wording may not either.
// - anything link-like: a URL, a bare domain, an e-mail address or a path.
// Model output and an officer's edited wording go through the same check.

export const MAX_ALERT_TEXT = 700

// The templates' typography beyond printable ASCII: "×" weighs the doctor
// team's score, "–" (en dash) writes a range (src/qr formatRange).
export const TEMPLATE_TYPOGRAPHY = ['×', '–'] as const

const isAsciiPrintable = (char: string) => char >= ' ' && char <= '~'

// Printable ASCII, a line break, the templates' typography and the letters of
// the demo place names that aren't ASCII (the "ñ" of Santo Niño-D). The facts
// test checks that every template is written in it.
export const ALERT_ALPHABET: ReadonlySet<string> = new Set([
  '\n',
  ...TEMPLATE_TYPOGRAPHY,
  ...DEMO_BARANGAYS.flatMap((place) => [...place.name].filter((char) => !isAsciiPrintable(char))),
])

export const inAlertAlphabet = (char: string) => isAsciiPrintable(char) || ALERT_ALPHABET.has(char)

const codePoint = (char: string) => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`

// The characters outside the alphabet, by code point (an invisible one can't
// be shown), at most 5.
export function strangeCharacters(text: string): string[] {
  return [...new Set([...text].filter((char) => !inAlertAlphabet(char)))].slice(0, 5).map(codePoint)
}

// A URL scheme, "www.", a bare domain ("example.com", "bit.ly/x"), an e-mail
// address (any "@") or a path (any "/" or "\"). The templates have none of
// these; a word.word with no space after the dot counts as a domain.
const LINK_LIKE = [
  /\b(?:https?|ftp|mailto|tel|sms|javascript|data|file):/i,
  /\bwww\./i,
  /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/i,
  /@/,
  /[/\\]/,
]

export const LINK_REASON = 'The wording adds a link, a web or e-mail address, or a path ("/").'

export function checkAlertText(text: string, alert: { facts: AlertFacts; templateText: string }): DraftCheck {
  if (text.length > MAX_ALERT_TEXT) return { ok: false, reasons: [`The wording is longer than ${MAX_ALERT_TEXT} characters.`] }
  const strange = strangeCharacters(text)
  if (strange.length) {
    return {
      ok: false,
      reasons: [
        `The wording has characters the alerts don't use (${strange.join(', ')}). Use plain letters, digits and punctuation, with straight quotes.`,
      ],
    }
  }
  if (LINK_LIKE.some((pattern) => pattern.test(text))) return { ok: false, reasons: [LINK_REASON] }
  return checkDraft(text, alert.templateText, planFactsOf(alert.facts), knownNames(alert.facts))
}

function planFactsOf(facts: AlertFacts): PlanFacts {
  switch (facts.kind) {
    case 'doctor-team':
      return { priority: [{ name: facts.name, score: facts.score }], moves: [] }
    case 'move-stock':
      return { priority: [], moves: [{ fromName: facts.fromName, toName: facts.toName, capsulesUpTo: facts.capsulesUpTo }] }
    case 'watch':
      // The barangay's watch-window count must stay next to its name.
      return { priority: [{ name: facts.name, score: countRange(facts.inWatchWindow) }], moves: [] }
  }
}

import { countRange } from '../../src/qr/index.js'
import { checkDraft, type DraftCheck, type PlanFacts } from '../../src/features/municipal/llm/check.js'
import { knownNames, type AlertFacts } from './facts.js'

// An alert's wording is checked with the same positional check the laptop's
// AI wording panel uses (src/features/municipal/llm/check.ts): every number
// must be one of the template's, the barangay's own number must sit next to
// its name, a stock move keeps its from, to and amount in one sentence, and
// no dose, schedule, diagnosis, prescription or other barangay may be added.
// It's a word-level check, so a person still approves every alert.

export const MAX_ALERT_TEXT = 700

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

export function checkAlertText(text: string, alert: { facts: AlertFacts; templateText: string }): DraftCheck {
  if (text.length > MAX_ALERT_TEXT) return { ok: false, reasons: [`The wording is longer than ${MAX_ALERT_TEXT} characters.`] }
  if (/https?:|www\./i.test(text)) return { ok: false, reasons: ['The wording adds a link.'] }
  return checkDraft(text, alert.templateText, planFactsOf(alert.facts), knownNames(alert.facts))
}

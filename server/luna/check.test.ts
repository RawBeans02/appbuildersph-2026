import { describe, expect, it } from 'vitest'
import { createPayload, type RawCounts } from '../../src/qr/index.js'
import { DEMO_BARANGAYS } from '../../src/data/places.js'
import { scenarioPayloads, SCENARIO_COUNTS } from '../test/lunaScenario.js'
import { ALERT_ALPHABET, checkAlertText, inAlertAlphabet, LINK_REASON, strangeCharacters, TEMPLATE_TYPOGRAPHY } from './check.js'
import { alertCandidates, type AlertCandidate } from './facts.js'

// The hard refusals in front of the positional check: characters outside the
// templates' alphabet, and anything link-like. Synthetic facts only.

// Every demo barangay (Santo Niño-D's "ñ" included), with ranges ("<5" sums),
// stock to move and a watch window: every kind of template.
const EVERY_PLACE: RawCounts = {
  ...SCENARIO_COUNTS['SID-MAL'],
  urgentReferrals: 3,
  fastBreathing: { under2m: 2, m2to12: 1, y1to5: 6 },
}
function everyPlacePayloads() {
  return DEMO_BARANGAYS.map((place, i) =>
    createPayload({
      municipality: 'SID',
      barangay: place.code,
      epiWeek: '2026-W41',
      seq: i + 1,
      counts:
        i % 2 === 0
          ? { ...EVERY_PLACE, inWatchWindow: 5 + i * 3 }
          : { ...EVERY_PLACE, inWatchWindow: i, doxyCapsulesOnHand: 90, doxyCapsulesExpiring6w: 20 + i },
    }),
  )
}

const allCandidates: AlertCandidate[] = [...alertCandidates(scenarioPayloads()), ...alertCandidates(everyPlacePayloads())]
const team = allCandidates.find((candidate) => candidate.kind === 'doctor-team')!
const move = allCandidates.find((candidate) => candidate.kind === 'move-stock')!
const watch = allCandidates.find((candidate) => candidate.kind === 'watch')!

const refused = (text: string, candidate: AlertCandidate) => {
  const result = checkAlertText(text, candidate)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.reasons.join(' ')
}

describe("the alert alphabet (derived from the templates' own characters)", () => {
  it('covers every character of every template, and every template passes the whole check', () => {
    expect(allCandidates.map((candidate) => candidate.kind)).toEqual(expect.arrayContaining(['doctor-team', 'move-stock', 'watch']))
    const used = new Set(allCandidates.flatMap((candidate) => [...candidate.templateText]))
    // The templates do use the extra characters (so none of them is dead weight)…
    for (const char of TEMPLATE_TYPOGRAPHY) expect(used.has(char)).toBe(true)
    expect(used.has('ñ')).toBe(true)
    // …and nothing outside the alphabet.
    expect([...used].filter((char) => !inAlertAlphabet(char))).toEqual([])
    for (const candidate of allCandidates) expect(checkAlertText(candidate.templateText, candidate)).toEqual({ ok: true })
  })

  it('is printable ASCII, a line break, "×", "–" and the place names\' "ñ", nothing else', () => {
    expect([...ALERT_ALPHABET].sort()).toEqual(['\n', 'ñ', '×', '–'].sort())
    expect(inAlertAlphabet('~')).toBe(true)
    expect(inAlertAlphabet('\t')).toBe(false)
    expect(inAlertAlphabet('\u007f')).toBe(false)
  })

  it('refuses non-ASCII digits that would slip past the number check', () => {
    // Fullwidth and Arabic-Indic digits: a phone number the number check reads as no number at all.
    expect(refused(`${team.templateText} Text ０９１７ for help.`, team)).toMatch(/U\+FF10.*U\+FF19|U\+FF19.*U\+FF10/)
    expect(refused(`${watch.templateText} Call ٠٩١٧.`, watch)).toMatch(/U\+0660/)
  })

  it('refuses zero-width and look-alike characters', () => {
    // A zero-width space splits a barangay name, so the name check can't see it.
    expect(refused(team.templateText.replace('Maligaya-D', 'Mali\u200Bgaya-D'), team)).toMatch(/U\+200B/)
    // A Cyrillic "а" makes another barangay's name look like this one's.
    expect(refused(`${watch.templateText} Mаbini-D too.`, watch)).toMatch(/U\+0430/)
    // Soft hyphen, a right-to-left override, a non-breaking space, curly quotes.
    for (const [char, code] of [['\u00AD', 'U+00AD'], ['\u202E', 'U+202E'], ['\u00A0', 'U+00A0'], ['’', 'U+2019']]) {
      expect(refused(`${move.templateText} Note${char}this.`, move)).toContain(code)
    }
    expect(strangeCharacters('a\u200Bb\u200Bc')).toEqual(['U+200B'])
  })

  it('says which characters, by code point, and how to fix it', () => {
    expect(refused(`${move.templateText} ok\u200B`, move)).toBe(
      "The wording has characters the alerts don't use (U+200B). Use plain letters, digits and punctuation, with straight quotes.",
    )
  })
})

describe('the link test', () => {
  it('refuses URLs, bare domains, e-mail addresses and paths', () => {
    for (const extra of [
      'See https://example.com for more.',
      'Details at www.example.org today.',
      'Details at agapay-alerts.ph today.',
      'Short link: bit.ly please.',
      'Write to mho@sid-health.ph today.',
      'Reply to mho at sid@health today.',
      'Open /doh on the laptop.',
      'Open doh/alerts on the laptop.',
      'Open C:\\alerts on the laptop.',
      'Call tel:+ for help.',
    ]) {
      expect(refused(`${team.templateText} ${extra}`, team)).toBe(LINK_REASON)
    }
  })

  it('applies to an edited wording the same way (a domain with no scheme)', () => {
    const edited = `${move.templateText} Report back via sid-health.gov.ph.`
    expect(refused(edited, move)).toBe(LINK_REASON)
  })

  it('still passes ordinary sentences, "e.g." and an ISO week in brackets', () => {
    const text =
      'If the municipal health officer agrees, move up to 30 doxycycline capsules that expire within 6 weeks from Bagong Silang-D to Maligaya-D, e.g. by the next RHU trip. ' +
      'Bagong Silang-D has 0 residents in the watch window and 80 capsules on hand; Maligaya-D has 12 in the watch window and 10 capsules on hand. ' +
      'Doxycycline is given only after consultation with a health professional.'
    const scenarioMove = alertCandidates(scenarioPayloads()).find((candidate) => candidate.kind === 'move-stock')!
    expect(checkAlertText(text, scenarioMove)).toEqual({ ok: true })
  })
})

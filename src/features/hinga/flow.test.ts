import { describe, expect, it } from 'vitest'
import { hingaOutcome } from '../../rules/imci'
import {
  answered,
  DANGER_SIGN_ROUTE,
  hingaScreen,
  MAX_LOAD_FAILURES,
  needsPrePermission,
  offerHandCount,
  offersDangerSigns,
  tickNone,
  tickSign,
  type DangerAnswer,
  type FlowInput,
} from './flow'

// The camera step on a phone that runs everything: model ready, camera on.
const camera: FlowInput = {
  step: 'camera',
  saved: false,
  webAssembly: true,
  model: 'ready',
  loadFailures: 0,
  prePermission: false,
  camera: 'on',
  counting: false,
  refused: false,
  counted: false,
  handDone: false,
}

describe('Hinga routing', () => {
  it('walks age → framing → counting → result', () => {
    expect(hingaScreen({ ...camera, step: 'age' })).toBe('age')
    expect(hingaScreen(camera)).toBe('framing')
    expect(hingaScreen({ ...camera, model: 'loading', camera: 'starting' })).toBe('framing')
    expect(hingaScreen({ ...camera, counting: true })).toBe('counting')
    expect(hingaScreen({ ...camera, counted: true })).toBe('result')
    expect(hingaScreen({ ...camera, counted: true, saved: true })).toBe('saved')
  })

  it('shows a refusal, then framing again once it is cleared', () => {
    expect(hingaScreen({ ...camera, refused: true })).toBe('refused')
    expect(hingaScreen({ ...camera, refused: false })).toBe('framing')
  })

  it('shows 3c before the camera prompt, then framing', () => {
    expect(hingaScreen({ ...camera, prePermission: true, camera: 'off' })).toBe('pre-permission')
    expect(hingaScreen({ ...camera, prePermission: false, camera: 'starting' })).toBe('framing')
  })

  it('shows 3d when the camera is blocked or missing', () => {
    expect(hingaScreen({ ...camera, camera: 'blocked' })).toBe('camera-blocked')
  })

  it('shows L9b on the first failed load and L8a on the second', () => {
    expect(hingaScreen({ ...camera, model: 'error', loadFailures: 1 })).toBe('didnt-load')
    // Try again: loading again, the framing screen waits for it.
    expect(hingaScreen({ ...camera, model: 'loading', loadFailures: 1 })).toBe('framing')
    expect(hingaScreen({ ...camera, model: 'error', loadFailures: MAX_LOAD_FAILURES })).toBe('cant-run')
    // Before the camera prompt too: no point asking for a camera it can't use.
    expect(hingaScreen({ ...camera, model: 'error', loadFailures: 1, prePermission: true })).toBe('didnt-load')
  })

  it('shows L8a straight away without WebAssembly', () => {
    expect(hingaScreen({ ...camera, webAssembly: false, model: 'loading', prePermission: true })).toBe('cant-run')
  })

  it('counts by hand from 3d or L8a, then shows the same result screens', () => {
    for (const from of [{ camera: 'blocked' as const }, { model: 'error' as const, loadFailures: 2 }, { webAssembly: false }]) {
      expect(hingaScreen({ ...camera, ...from, step: 'hand' })).toBe('hand-count')
      expect(hingaScreen({ ...camera, ...from, step: 'hand', handDone: true })).toBe('result')
      expect(hingaScreen({ ...camera, ...from, step: 'hand', handDone: true, saved: true })).toBe('saved')
      // Stop goes back to where it came from.
      expect(hingaScreen({ ...camera, ...from, step: 'camera' })).toMatch(/^(camera-blocked|cant-run)$/)
    }
  })
})

describe('Hinga danger signs without a count', () => {
  // Every way the count can fail, be refused or not run, and the hand count.
  const noCount: [string, FlowInput][] = [
    ['refused (motion, no chest, too few frames…)', { ...camera, refused: true }],
    ['camera blocked or missing (3d)', { ...camera, camera: 'blocked' }],
    ["the breathing check didn't load (L9b)", { ...camera, model: 'error', loadFailures: 1 }],
    ["the phone can't run it (L8a), after two failed loads", { ...camera, model: 'error', loadFailures: MAX_LOAD_FAILURES }],
    ["the phone can't run it (L8a), no WebAssembly", { ...camera, webAssembly: false }],
    ['counting by hand (L8b)', { ...camera, camera: 'blocked', step: 'hand' }],
  ]

  it.each(noCount)('offers the danger signs when %s', (_, input) => {
    const from = hingaScreen(input)
    expect(offersDangerSigns(from)).toBe(true)
    // "Danger sign seen? Refer now" opens the checklist, with no count…
    expect(hingaScreen({ ...input, step: 'signs' })).toBe('danger-signs')
    // …"None of these" goes back to the same screen and its options…
    expect(hingaScreen(input)).toBe(from)
    // …and a saved URGENT check shows 6c.
    expect(hingaScreen({ ...input, step: 'signs', saved: true })).toBe('saved')
  })

  it('covers every screen without a count, and none with one', () => {
    expect([...DANGER_SIGN_ROUTE].sort()).toEqual(['camera-blocked', 'cant-run', 'didnt-load', 'hand-count', 'refused'])
    for (const screen of ['age', 'framing', 'counting', 'result', 'saved'] as const) expect(offersDangerSigns(screen)).toBe(false)
  })

  it('makes any sign ticked there URGENT, and no sign is not a result', () => {
    for (const ageMonths of [0, 6, 24]) {
      expect(hingaOutcome({ breathsPerMinute: null, ageMonths, dangerSigns: ['vomits-everything'] })).toBe('urgent')
      expect(hingaOutcome({ breathsPerMinute: null, ageMonths, dangerSigns: [] })).toBe('refused')
    }
  })
})

describe('Hinga camera pre-permission (3c)', () => {
  it('shows once, only when the browser will ask', () => {
    expect(needsPrePermission(false, 'prompt')).toBe(true)
    expect(needsPrePermission(false, null)).toBe(true)
    expect(needsPrePermission(true, 'prompt')).toBe(false)
    expect(needsPrePermission(false, 'granted')).toBe(false)
    expect(needsPrePermission(false, 'denied')).toBe(false)
  })
})

describe('Hinga refusals in a row', () => {
  it('offers the hand count from the second refusal in a row', () => {
    expect([0, 1, 2, 3].map(offerHandCount)).toEqual([false, false, true, true])
  })
})

describe('Hinga danger-sign answer', () => {
  const empty: DangerAnswer = { signs: [], none: false }

  it('needs a tick or "None of these" before saving', () => {
    expect(answered(empty)).toBe(false)
    expect(answered(tickSign(empty, 'stridor', true))).toBe(true)
    expect(answered(tickNone(empty, true))).toBe(true)
    expect(answered(tickSign(tickSign(empty, 'stridor', true), 'stridor', false))).toBe(false)
  })

  it('keeps signs and "None of these" apart', () => {
    const signs = tickSign(tickSign(empty, 'stridor', true), 'convulsions', true)
    expect(signs).toEqual({ signs: ['stridor', 'convulsions'], none: false })
    expect(tickNone(signs, true)).toEqual({ signs: [], none: true })
    expect(tickSign(tickNone(signs, true), 'lethargic', true)).toEqual({ signs: ['lethargic'], none: false })
    expect(tickSign(signs, 'stridor', true).signs).toEqual(['convulsions', 'stridor'])
  })
})

// Which Hinga screen shows, from where the health worker is in the flow and
// what the camera session reports (design/README.md, "Behavior that matters").
// Pure, so the routing is tested without a browser; HingaPage renders it.

export type HingaScreen =
  | 'age' // 2a: age band and readiness
  | 'pre-permission' // 3c: before the browser's camera and microphone prompt
  | 'framing' // 3a looking, 3b chest found
  | 'camera-blocked' // 3d: permission denied or no camera
  | 'counting' // 4a: the 60 s count
  | 'refused' // 5a–5d: the quality gate stopped the count
  | 'didnt-load' // L9b: the breathing check's files are here but it didn't load
  | 'cant-run' // L8a: no WebAssembly, or it failed to load twice
  | 'hand-count' // L8b: tap once per breath for 60 s
  | 'result' // 6a fast, 6b URGENT, 7a not fast
  | 'danger-signs' // the danger-sign check with no count (6b's checklist and band)
  | 'saved' // 6c

// The child being checked (2a). ageMonths is a linked resident's age in whole
// months, or the picked band's first month (all the record needs: the cut-off
// and the QR's age band).
export type LinkedResident = { id: string; name: string; householdId: string }

export type Child = { resident: LinkedResident | null; ageMonths: number | null; calm: boolean }

export const NO_CHILD: Child = { resident: null, ageMonths: null, calm: false }

// 'camera' covers 3a–5d with the camera check's own fallbacks (3c, 3d, L9b,
// L8a); 'hand' is L8b, reached from 3d and L8a; 'signs' is the danger-sign
// check without a count, reached from every screen in DANGER_SIGN_ROUTE.
export type HingaStep = 'age' | 'camera' | 'hand' | 'signs'

// A second failed load leads to L8a (design: L9b's note).
export const MAX_LOAD_FAILURES = 2

export type FlowInput = {
  step: HingaStep
  saved: boolean
  // The camera check.
  webAssembly: boolean
  model: 'loading' | 'ready' | 'error'
  loadFailures: number
  prePermission: boolean
  camera: 'off' | 'starting' | 'on' | 'blocked'
  counting: boolean
  // A refusal to show (a count the health worker cancelled is not one).
  refused: boolean
  counted: boolean
  // Counting by hand: the minute is up.
  handDone: boolean
}

export function hingaScreen(input: FlowInput): HingaScreen {
  if (input.saved) return 'saved'
  switch (input.step) {
    case 'age':
      return 'age'
    case 'hand':
      return input.handDone ? 'result' : 'hand-count'
    case 'signs':
      return 'danger-signs'
    case 'camera':
      if (input.counted) return 'result'
      if (!input.webAssembly || input.loadFailures >= MAX_LOAD_FAILURES) return 'cant-run'
      if (input.model === 'error') return 'didnt-load'
      if (input.prePermission) return 'pre-permission'
      if (input.camera === 'blocked') return 'camera-blocked'
      if (input.refused) return 'refused'
      if (input.counting) return 'counting'
      return 'framing'
  }
}

// 3c shows once, and only when the browser is going to ask: not when the
// camera is already allowed or already blocked (3d covers that). `permission`
// is null where the browser can't say (no Permissions API, or no 'camera' name).
export function needsPrePermission(shownBefore: boolean, permission: PermissionState | null): boolean {
  return !shownBefore && permission !== 'granted' && permission !== 'denied'
}

// After the second refusal in a row, the refusal sheet also offers the hand
// count (design review decision 4). A count that worked resets the run.
export const HAND_COUNT_AFTER_REFUSALS = 2

export const offerHandCount = (refusalsInRow: number) => refusalsInRow >= HAND_COUNT_AFTER_REFUSALS

// The screens where the count failed, was refused or can't run, and the hand
// count: each offers "Danger sign seen? Refer now", so the danger signs are
// never out of reach when there is no count (review fix). "None of these"
// there goes back to the same screen.
export const DANGER_SIGN_ROUTE: readonly HingaScreen[] = ['refused', 'camera-blocked', 'didnt-load', 'cant-run', 'hand-count']

export const offersDangerSigns = (screen: HingaScreen) => DANGER_SIGN_ROUTE.includes(screen)

// The danger-sign answer on 6a/6b/7a: ticked signs, or "None of these" (never
// both). Save needs one of the two (design review decision 3).
export type DangerAnswer<Sign extends string = string> = { signs: Sign[]; none: boolean }

export function tickSign<Sign extends string>(answer: DangerAnswer<Sign>, sign: Sign, on: boolean): DangerAnswer<Sign> {
  const signs = answer.signs.filter((s) => s !== sign)
  return on ? { signs: [...signs, sign], none: false } : { signs, none: answer.none }
}

export function tickNone<Sign extends string>(answer: DangerAnswer<Sign>, on: boolean): DangerAnswer<Sign> {
  return on ? { signs: [], none: true } : { signs: answer.signs, none: false }
}

export const answered = (answer: DangerAnswer) => answer.signs.length > 0 || answer.none

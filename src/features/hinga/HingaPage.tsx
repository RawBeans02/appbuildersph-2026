import { useEffect, useState, useSyncExternalStore } from 'react'
import { useFlowMode } from '../../app/flow'
import { navigate } from '../../app/router'
import { detectPlatform } from '../../lib/backend'
import { useHoldReload } from '../../lib/useHoldReload'
import { AgeStep } from './AgeStep'
import { CameraBlockedScreen, CameraScreen, PrePermissionScreen } from './CameraScreens'
import { ageBand } from './copy'
import { createCountSession, type CountSession } from './countSession'
import { CantRunScreen, DidntLoadScreen } from './FallbackScreens'
import { hingaScreen, needsPrePermission, NO_CHILD, offerHandCount, type Child, type HingaStep } from './flow'
import { HandCountScreen } from './HandCountScreen'
import { ResultScreen, type Reading, type SavedCheck } from './ResultScreen'

// Hinga, screens 2a–7a with the camera check's fallbacks (3c, 3d, L8a, L8b,
// L9b); flow.ts decides which one shows. A focused flow: no bottom nav. The
// video and the microphone audio stay on this phone and are never stored.

// 3c shows once per phone (design: "First run only").
const PRE_PERMISSION_KEY = 'agapay.hinga.cameraExplained'

function prePermissionShown(): boolean {
  try {
    return localStorage.getItem(PRE_PERMISSION_KEY) === '1'
  } catch {
    return false
  }
}

function rememberPrePermission() {
  try {
    localStorage.setItem(PRE_PERMISSION_KEY, '1')
  } catch {
    // Private mode: 3c may show again next time.
  }
}

// null where the browser can't say (no Permissions API, or no 'camera' name).
async function cameraPermission(): Promise<PermissionState | null> {
  try {
    return (await navigator.permissions.query({ name: 'camera' as PermissionName })).state
  } catch {
    return null
  }
}

const webAssembly = detectPlatform().webAssembly

export default function HingaPage() {
  useFlowMode(true)
  // The session lives as long as the page: its models load on mount and
  // everything (camera, microphone, workers) stops on unmount.
  const [session] = useState(() => createCountSession())
  useEffect(() => {
    session.open()
    return () => session.close()
  }, [session])
  return <HingaFlow session={session} />
}

function HingaFlow({ session }: { session: CountSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState)
  const [step, setStep] = useState<HingaStep>('age')
  const [child, setChild] = useState<Child>(NO_CHILD)
  const [explained, setExplained] = useState(prePermissionShown)
  const [permission, setPermission] = useState<PermissionState | null>(null)
  const [handReading, setHandReading] = useState<Reading | null>(null)
  const [saved, setSaved] = useState<SavedCheck | null>(null)

  useEffect(() => {
    let cancelled = false
    void cameraPermission().then((value) => !cancelled && setPermission(value))
    return () => {
      cancelled = true
    }
  }, [])

  const outcome = state.outcome
  const cameraReading: Reading | null =
    outcome?.kind === 'counted' ? { perMin: outcome.perMin, at: outcome.at, method: 'camera', cryOff: outcome.cryOff } : null
  const screen = hingaScreen({
    step,
    saved: saved !== null,
    webAssembly,
    model: state.model.status,
    loadFailures: state.loadFailures,
    prePermission: needsPrePermission(explained, permission),
    camera: state.camera.status,
    counting: state.counting !== null,
    refused: outcome?.kind === 'refused' && outcome.refusal !== 'interrupted',
    counted: cameraReading !== null,
    handDone: handReading !== null,
  })

  // The camera runs only on the camera screens; it starts on its own there
  // (after 3c, Continue starts it with the microphone prompt).
  const cameraOn = screen === 'framing' || screen === 'counting' || screen === 'refused'
  // A new deploy waits until the 60 s count is over.
  useHoldReload(state.counting !== null)
  useEffect(() => {
    if (!cameraOn) session.stopCamera()
    else if (state.camera.status === 'off') void session.startCamera()
  }, [cameraOn, state.camera.status, session])

  const band = child.ageMonths === null ? null : ageBand(child.ageMonths)
  const reading = step === 'hand' ? handReading : cameraReading
  const leave = () => navigate('/')

  function toHandCount() {
    session.clearOutcome()
    setStep('hand')
  }

  function another() {
    session.clearOutcome()
    session.resetRefusals()
    setChild(NO_CHILD)
    setHandReading(null)
    setSaved(null)
    setStep('age')
  }

  return (
    // The data attributes let the CI e2e check the on-device models without
    // showing their details on screen.
    <div
      data-hinga-screen={screen}
      data-hinga-model={state.model.status === 'ready' ? `ready:${state.model.where}` : state.model.status}
      data-hinga-cry={state.cry.status}
      data-hinga-camera={state.camera.status}
    >
      {screen === 'age' && (
        <AgeStep
          child={child}
          onChange={setChild}
          onBack={leave}
          onNext={() => {
            session.clearOutcome()
            session.resetRefusals()
            setStep('camera')
          }}
        />
      )}
      {screen === 'pre-permission' && (
        <PrePermissionScreen
          onCancel={() => setStep('age')}
          onContinue={() => {
            rememberPrePermission()
            setExplained(true)
            void session.startCamera(true)
          }}
        />
      )}
      {screen === 'camera-blocked' && (
        <CameraBlockedScreen onHandCount={toHandCount} onRetry={() => void session.startCamera()} onClose={() => setStep('age')} />
      )}
      {(screen === 'framing' || screen === 'counting' || screen === 'refused') && (
        <CameraScreen
          session={session}
          state={state}
          onCancel={leave}
          onRetry={() => session.clearOutcome()}
          onHandCount={offerHandCount(state.refusalsInRow) ? toHandCount : null}
        />
      )}
      {screen === 'didnt-load' && <DidntLoadScreen onRetry={() => session.reloadModel()} onHandCount={toHandCount} onBack={() => setStep('age')} />}
      {screen === 'cant-run' && <CantRunScreen onHandCount={toHandCount} onBack={() => setStep('age')} />}
      {screen === 'hand-count' && band && (
        <HandCountScreen
          band={band}
          onStop={() => setStep('camera')}
          onDone={(perMin) => setHandReading({ perMin, at: new Date().toISOString(), method: 'hand', cryOff: null })}
        />
      )}
      {(screen === 'result' || screen === 'saved') && band && reading && child.ageMonths !== null && (
        <ResultScreen
          key={reading.at}
          reading={reading}
          ageMonths={child.ageMonths}
          band={band}
          resident={child.resident}
          saved={saved}
          onSaved={setSaved}
          onClose={leave}
          onAnother={another}
          onDone={leave}
        />
      )}
    </div>
  )
}

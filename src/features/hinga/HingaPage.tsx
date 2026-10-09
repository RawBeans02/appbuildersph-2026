import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from '../../app/Link'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import type { HingaCheck, Resident } from '../../data/db/types'
import { useDbQuery } from '../../data/db/useDbQuery'
import { localToday } from '../../rules/dates'
import {
  ageBandLabel,
  completedMonths,
  DANGER_SIGNS,
  DANGER_SIGNS_NOTE,
  DANGER_SIGNS_TITLE,
  fastBreathingCutoff,
  hingaOutcome,
  MAX_AGE_MONTHS,
  type DangerSign,
} from '../../rules/imci'
import { buildHingaCheck, newCheckId } from './check'
import { outcomeText, READINESS, refusalText, SCREENING_NOTE } from './copy'
import { createCountSession, type CountRefusal, type CountSession, type SessionState } from './countSession'

// Hinga, screens 2-7: age band and readiness, framing, the 60 s count with a
// live trace, refusals (one retry each), the result with the danger signs, and
// saving the check. Plain until design/ lands. NEEDS DESIGN: screens 2-7.
// The video and the microphone audio stay on this phone and are never stored.

const readResidents = (db: AgapayDb) => db.residents.list({ limit: 1000 })

type Child = { residentId: string | null; ageMonths: number | null }

export default function HingaPage() {
  // The session lives as long as the page: its models load on mount and
  // everything (camera, microphone, workers) stops on unmount.
  const [session] = useState(() => createCountSession())
  useEffect(() => {
    session.open()
    return () => session.close()
  }, [session])

  return (
    <>
      <h1>Hinga breathing check</h1>
      <p>
        <strong>{SCREENING_NOTE}</strong>
      </p>
      <HingaFlow session={session} />
    </>
  )
}

function HingaFlow({ session }: { session: CountSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState)
  const [child, setChild] = useState<Child>({ residentId: null, ageMonths: null })
  const [step, setStep] = useState<'setup' | 'check'>('setup')
  const [attempts, setAttempts] = useState(0)
  const [lastRefusal, setLastRefusal] = useState<CountRefusal | null>(null)
  const [withoutCount, setWithoutCount] = useState(false)
  const [saved, setSaved] = useState<HingaCheck | null>(null)

  const counted = state.outcome?.kind === 'counted' ? state.outcome.perMin : null
  const view = saved ? 'saved' : step === 'setup' ? 'setup' : counted !== null || withoutCount ? 'result' : 'camera'

  // The camera is only needed while framing and counting.
  useEffect(() => {
    if (view !== 'camera') session.stopCamera()
  }, [view, session])

  function startCount() {
    setAttempts((n) => n + 1)
    void session.startCount()
  }

  function retry() {
    if (state.outcome?.kind === 'refused') setLastRefusal(state.outcome.refusal)
    session.clearOutcome()
  }

  function continueWithoutCount() {
    if (state.outcome?.kind === 'refused') setLastRefusal(state.outcome.refusal)
    setWithoutCount(true)
  }

  function newCheck() {
    session.clearOutcome()
    setChild({ residentId: null, ageMonths: null })
    setStep('setup')
    setAttempts(0)
    setLastRefusal(null)
    setWithoutCount(false)
    setSaved(null)
  }

  return (
    <>
      <ModelStatus state={state} />
      {view === 'setup' && (
        <Setup
          child={child}
          onChange={setChild}
          onNext={() => {
            setStep('check')
            void session.startCamera()
          }}
        />
      )}
      {view === 'camera' && (
        <Camera
          session={session}
          state={state}
          ageMonths={child.ageMonths!}
          canRetry={attempts < 2}
          onStartCount={startCount}
          onRetry={retry}
          onContinue={continueWithoutCount}
          onBack={() => {
            session.clearOutcome()
            setStep('setup')
          }}
        />
      )}
      {view === 'result' && (
        <Result
          child={child}
          breathsPerMinute={counted}
          refusal={state.outcome?.kind === 'refused' ? state.outcome.refusal : lastRefusal}
          onSaved={setSaved}
        />
      )}
      {view === 'saved' && saved && <Saved check={saved} onNew={newCheck} />}
      <Measured state={state} />
    </>
  )
}

function ModelStatus({ state }: { state: SessionState }) {
  const { model, cry } = state
  return (
    <section aria-label="On-device models">
      <p role="status">
        {model.status === 'loading' && 'Loading the torso finder on this phone…'}
        {model.status === 'ready' &&
          `Torso finder ready on this phone (${model.where === 'worker' ? 'in a background worker' : 'on the page itself'}).`}
        {model.status === 'error' && (
          <>
            The torso finder could not load: {model.message}.{' '}
            <Link to="/prepare">Prepare for offline</Link> while online, then come back.
          </>
        )}
      </p>
      {model.status === 'ready' && model.note && <p>Running on the page itself because {model.note}.</p>}
      <p>
        {cry.status === 'loading' && 'Cry check: loading…'}
        {cry.status === 'ready' && 'Cry check: ready. The microphone is used only during the count, and nothing is recorded.'}
        {cry.status === 'listening' && `Cry check: on${cry.cryingSeconds > 0 ? ` (${cry.cryingSeconds.toFixed(0)} s of crying heard)` : ''}.`}
        {cry.status === 'off' && `Cry check off: ${cry.reason}.`}
      </p>
    </section>
  )
}

function Setup({ child, onChange, onNext }: { child: Child; onChange(child: Child): void; onNext(): void }) {
  const residents = useDbQuery(['residents'], readResidents)
  const [today] = useState(localToday)
  const [manualAge, setManualAge] = useState(child.residentId === null && child.ageMonths !== null ? String(child.ageMonths) : '')
  const [ticked, setTicked] = useState<boolean[]>(READINESS.map(() => false))

  const children: { resident: Resident; months: number }[] =
    residents.status === 'ready'
      ? residents.data
          .map((resident) => ({ resident, months: completedMonths(resident.birthDate, today) }))
          .filter(({ months }) => months >= 0 && months < MAX_AGE_MONTHS)
      : []

  const cutoff = child.ageMonths === null ? null : fastBreathingCutoff(child.ageMonths)
  const band = child.ageMonths === null ? null : ageBandLabel(child.ageMonths)
  const ready = cutoff !== null && ticked.every(Boolean)

  function pickResident(id: string) {
    const picked = children.find(({ resident }) => resident.id === id)
    onChange(picked ? { residentId: picked.resident.id, ageMonths: picked.months } : { residentId: null, ageMonths: parseAge(manualAge) })
  }

  function typeAge(value: string) {
    setManualAge(value)
    onChange({ residentId: null, ageMonths: parseAge(value) })
  }

  return (
    <section aria-labelledby="hinga-setup">
      <h2 id="hinga-setup">The child</h2>
      <p>
        <label>
          Resident (optional){' '}
          <select value={child.residentId ?? ''} onChange={(event) => pickResident(event.target.value)}>
            <option value="">Not in the list: enter the age</option>
            {children.map(({ resident, months }) => (
              <option key={resident.id} value={resident.id}>
                {resident.name} · {resident.householdId} · {months} months{resident.sample ? ' (sample data)' : ''}
              </option>
            ))}
          </select>
        </label>
      </p>
      {child.residentId === null && (
        <p>
          <label>
            Age in months{' '}
            <input type="number" inputMode="numeric" min={0} max={59} step={1} value={manualAge} onChange={(event) => typeAge(event.target.value)} />
          </label>
        </p>
      )}
      <p role="status">
        {cutoff !== null && band
          ? `Age band: ${band}. Fast breathing is ${cutoff} breaths per minute or more (WHO IMCI).`
          : child.ageMonths !== null
            ? 'Hinga is for children under 5 years (0 to 59 months).'
            : 'Choose a resident or enter the age.'}
      </p>

      <fieldset>
        <legend>Ready to count?</legend>
        {READINESS.map((item, i) => (
          <p key={item}>
            <label>
              <input
                type="checkbox"
                checked={ticked[i]}
                onChange={(event) => setTicked(ticked.map((value, j) => (j === i ? event.target.checked : value)))}
              />{' '}
              {item}
            </label>
          </p>
        ))}
      </fieldset>
      <p>
        <button type="button" disabled={!ready} onClick={onNext}>
          Next: frame the chest
        </button>
      </p>
    </section>
  )
}

function parseAge(value: string): number | null {
  if (value.trim() === '') return null
  const months = Number(value)
  return Number.isFinite(months) ? months : null
}

function Camera(props: {
  session: CountSession
  state: SessionState
  ageMonths: number
  canRetry: boolean
  onStartCount(): void
  onRetry(): void
  onContinue(): void
  onBack(): void
}) {
  const { session, state } = props
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    session.attach(videoRef.current, canvasRef.current)
    return () => session.attach(null, null)
  }, [session])

  const refused = state.outcome?.kind === 'refused' ? refusalText(state.outcome.refusal) : null
  const canCount = state.model.status === 'ready' && state.camera.status === 'on' && state.regionFound && !state.counting && !refused

  return (
    <section aria-labelledby="hinga-camera">
      <h2 id="hinga-camera">{state.counting ? 'Counting' : 'Frame the chest'}</h2>
      <div style={{ position: 'relative', maxWidth: 640 }}>
        <video ref={videoRef} playsInline muted autoPlay style={{ display: 'block', width: '100%', height: 'auto' }} />
        <canvas ref={canvasRef} width={0} height={0} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }} />
      </div>

      {state.camera.status === 'off' && (
        <p>
          <button type="button" onClick={() => void session.startCamera()}>
            Start the camera
          </button>
        </p>
      )}
      {state.camera.status === 'starting' && <p role="status">Opening the camera…</p>}
      {state.camera.status === 'error' && (
        <p role="alert">
          {state.camera.message}{' '}
          <button type="button" onClick={() => void session.startCamera()}>
            Try again
          </button>
        </p>
      )}

      {state.camera.status === 'on' && !state.counting && !refused && (
        <p role="status">{state.regionFound ? 'Torso found. Hold still.' : 'No torso found: show the head, shoulders and chest.'}</p>
      )}
      {state.counting && (
        <p role="status">
          Counting… {state.counting.secondsLeft} s left. Keep the phone still. Torso {state.regionFound ? 'found' : 'not found'}.
        </p>
      )}

      {refused && (
        <div role="alert">
          <p>
            <strong>{refused.title}.</strong> {refused.detail}
          </p>
          {props.canRetry ? (
            <p>
              <button type="button" onClick={props.onRetry}>
                Try again
              </button>
            </p>
          ) : (
            <p>
              Still no count after one retry.{' '}
              <button type="button" onClick={props.onContinue}>
                Continue without a count
              </button>
            </p>
          )}
        </div>
      )}

      <p>
        {!state.counting && !refused && (
          <button type="button" disabled={!canCount} onClick={props.onStartCount}>
            Start the 60 s count
          </button>
        )}
        {state.counting && (
          <button type="button" onClick={() => session.cancelCount()}>
            Cancel the count
          </button>
        )}{' '}
        {!state.counting && (
          <button type="button" onClick={props.onBack}>
            Back
          </button>
        )}
      </p>
      <p>Green box: the torso found now. Blue box: the region being counted. Lines: the last 10 s of the breathing signals.</p>
    </section>
  )
}

function Result(props: { child: Child; breathsPerMinute: number | null; refusal: CountRefusal | null; onSaved(check: HingaCheck): void }) {
  const { child, breathsPerMinute } = props
  const [signs, setSigns] = useState<DangerSign[]>([])
  const [error, setError] = useState<string | null>(null)
  const ageMonths = child.ageMonths!
  const cutoff = fastBreathingCutoff(ageMonths)
  const outcome = hingaOutcome({ breathsPerMinute, ageMonths, dangerSigns: signs })
  const text = outcome ? outcomeText(outcome) : null

  async function save() {
    const check = buildHingaCheck({
      id: newCheckId(),
      residentId: child.residentId,
      checkedAt: new Date().toISOString(),
      ageMonths,
      breathsPerMinute,
      refusal: props.refusal,
      dangerSigns: signs,
    })
    if (!check) return
    try {
      await (await getDb()).hingaChecks.put(check)
      props.onSaved(check)
    } catch {
      setError('Could not save on this phone. Try again.')
    }
  }

  return (
    <section aria-labelledby="hinga-result">
      <h2 id="hinga-result">Result</h2>
      <p>
        {breathsPerMinute !== null
          ? `${breathsPerMinute} breaths per minute, counted on this phone.`
          : `No count${props.refusal ? ` (${refusalText(props.refusal).title.toLowerCase()})` : ''}.`}
      </p>
      {cutoff !== null && <p>Fast breathing at this age: {cutoff} breaths per minute or more (WHO IMCI 2014).</p>}

      <fieldset>
        <legend>{DANGER_SIGNS_TITLE}. Tick any you see.</legend>
        <p>{DANGER_SIGNS_NOTE}</p>
        {DANGER_SIGNS.map((sign) => (
          <p key={sign.id}>
            <label>
              <input
                type="checkbox"
                checked={signs.includes(sign.id)}
                onChange={(event) =>
                  setSigns(event.target.checked ? [...signs, sign.id] : signs.filter((id) => id !== sign.id))
                }
              />{' '}
              {sign.label}
            </label>
          </p>
        ))}
      </fieldset>

      {text && (
        <div role="status">
          <p>
            <strong>{text.title}</strong>
          </p>
          {text.tagalog && (
            <p lang="tl">
              <strong>{text.tagalog}</strong>
            </p>
          )}
        </div>
      )}
      <p>{SCREENING_NOTE}</p>
      {error && <p role="alert">{error}</p>}
      <p>
        <button type="button" onClick={() => void save()} disabled={!outcome}>
          Save the check
        </button>
      </p>
    </section>
  )
}

function Saved({ check, onNew }: { check: HingaCheck; onNew(): void }) {
  const text = outcomeText(check.outcome)
  return (
    <section aria-labelledby="hinga-saved">
      <h2 id="hinga-saved">Saved on this phone</h2>
      <p>
        {text.title}
        {check.breathsPerMinute !== null ? ` (${check.breathsPerMinute} breaths per minute)` : ''}.
      </p>
      <p>
        <button type="button" onClick={onNew}>
          New check
        </button>
      </p>
    </section>
  )
}

function Measured({ state }: { state: SessionState }) {
  const parts: string[] = []
  if (state.model.status === 'ready') parts.push(`model start ${Math.round(state.model.loadMs)} ms`)
  if (state.avgInferMs !== null) parts.push(`torso finder ${state.avgInferMs.toFixed(1)} ms per frame`)
  if (state.fps !== null) parts.push(`${state.fps.toFixed(1)} frames per second`)
  if (state.camera.status === 'on') parts.push(`camera ${state.camera.settings}`)
  return parts.length ? <p>Measured on this phone: {parts.join(' · ')}.</p> : null
}

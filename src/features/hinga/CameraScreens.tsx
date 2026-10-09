import {
  ArrowClockwiseIcon,
  ArrowsSplitIcon,
  CameraIcon,
  CameraSlashIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  ClockIcon,
  EyeSlashIcon,
  InfoIcon,
  MicrophoneIcon,
  SpeakerHighIcon,
  TimerIcon,
  VibrateIcon,
} from '@phosphor-icons/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { BottomSheet, Button, FlowTopBar, LocalStatus } from '../../components'
import { cx } from '../../components/cx'
import { COUNT_MS, type CountRefusal, type CountSession, type SessionState } from './countSession'
import { refusalText, type RefusalIcon } from './copy'
import { clockText } from './handCount'
import styles from './Hinga.module.css'

// The camera steps on a dark (--night) screen: 3a/3b framing, 4a the count,
// 5a–5d a refusal over the live image, and the 3c/3d sheets before and
// without the camera.

const REFUSAL_ICONS: Record<RefusalIcon, ReactNode> = {
  crying: <SpeakerHighIcon size={24} weight="bold" aria-hidden />,
  motion: <VibrateIcon size={24} weight="bold" aria-hidden />,
  chest: <EyeSlashIcon size={24} weight="bold" aria-hidden />,
  disagree: <ArrowsSplitIcon size={24} weight="bold" aria-hidden />,
  paused: <ClockIcon size={24} weight="bold" aria-hidden />,
}

export function CryOffNote({ reason }: { reason: string }) {
  return (
    <p className={styles.note}>
      <InfoIcon size={20} weight="bold" aria-hidden />
      Cry check off: {reason}.
    </p>
  )
}

// 3a/3b, 4a and 5a–5d share the live image, so the <video> stays mounted.
export function CameraScreen(props: {
  session: CountSession
  state: SessionState
  onCancel(): void
  onRetry(): void
  // After the second refusal in a row (design review decision 4).
  onHandCount: (() => void) | null
}) {
  const { session, state } = props
  const videoRef = useRef<HTMLVideoElement>(null)
  const traceRef = useRef<HTMLCanvasElement>(null)
  const counting = state.counting !== null
  useEffect(() => {
    session.attach(videoRef.current, traceRef.current)
  }, [session, counting])
  useEffect(() => () => session.attach(null, null), [session])

  const outcome = state.outcome
  const refusal = outcome?.kind === 'refused' && outcome.refusal !== 'interrupted' ? outcome.refusal : null
  const canStart = state.model.status === 'ready' && state.camera.status === 'on' && state.regionFound && !state.startingCount
  const found = state.regionFound && state.model.status === 'ready'

  return (
    <div className={cx(styles.camera, 'on-night')}>
      <div className={styles.cameraBar}>
        {counting ? (
          <>
            <FlowTopBar
              dark
              backKind="close"
              backLabel="Cancel"
              onBack={() => session.cancelCount()}
              step={{ text: 'step 3 of 3', current: 3, total: 3 }}
              right={<CountdownClock secondsLeft={state.counting!.secondsLeft} />}
            />
            <div className={styles.cameraStatus}>
              <LocalStatus dark />
            </div>
          </>
        ) : refusal ? (
          <FlowTopBar dark backKind="close" onBack={props.onCancel} right={<h1 className={styles.barTitle}>Count stopped</h1>} />
        ) : (
          <FlowTopBar
            dark
            backKind="close"
            backLabel="Cancel the check"
            onBack={props.onCancel}
            step={{ text: 'Hinga · step 2 of 3', current: 2, total: 3 }}
          />
        )}
      </div>

      <div className={styles.feed}>
        <video ref={videoRef} className={styles.video} playsInline muted autoPlay aria-hidden />
        {!refusal && (
          <div className={cx(styles.guide, counting ? styles.guideCounting : found && styles.guideFound)} aria-hidden>
            {!counting && (
              <span className={styles.guideLabel}>
                {found ? (
                  <>
                    <CheckCircleIcon size={18} weight="bold" />
                    Chest found
                  </>
                ) : (
                  'Chest here'
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {counting ? (
        <div className={styles.panel}>
          <h1 className={styles.countHead}>Hold still</h1>
          <div className={styles.trace}>
            <canvas ref={traceRef} role="img" aria-label="Breathing trace" />
          </div>
          <div className={styles.countBar} aria-hidden>
            <div className={styles.countFill} style={{ width: `${100 - (state.counting!.secondsLeft * 1000 * 100) / COUNT_MS}%` }} />
          </div>
          {state.cry.status === 'listening' && (
            <p className={styles.micLine}>
              <MicrophoneIcon size={18} weight="bold" aria-hidden />
              Listening for crying. Nothing is recorded.
            </p>
          )}
        </div>
      ) : (
        !refusal && (
          <div className={styles.panel}>
            <h1>Point at the chest. Hold the phone still.</h1>
            <p role="status" className={cx(styles.panelStatus, found && styles.found)}>
              {found ? (
                <>
                  <CheckCircleIcon size={20} weight="bold" aria-hidden />
                  Chest found. Ready to count.
                </>
              ) : (
                <>
                  <CircleNotchIcon size={20} weight="bold" aria-hidden className={styles.spin} />
                  Looking for the chest…
                </>
              )}
            </p>
            {canStart ? (
              <Button onNight icon={<TimerIcon size={22} weight="bold" aria-hidden />} tagalog="Simulan" onClick={() => void session.startCount()}>
                Start counting
              </Button>
            ) : (
              <Button onNight disabled>
                Start counting
              </Button>
            )}
          </div>
        )
      )}

      {refusal && (
        <RefusalSheet
          refusal={refusal}
          cryOff={outcome?.kind === 'refused' ? outcome.cryOff : null}
          onRetry={props.onRetry}
          onHandCount={props.onHandCount}
        />
      )}
    </div>
  )
}

function CountdownClock({ secondsLeft }: { secondsLeft: number }) {
  return (
    <span className={styles.timer}>
      <span role="timer" className={styles.cameraClock}>
        {clockText(secondsLeft * 1000)}
      </span>
      <span className={styles.cameraLeft}>left</span>
    </span>
  )
}

function RefusalSheet(props: {
  refusal: Exclude<CountRefusal, 'interrupted'>
  cryOff: string | null
  onRetry(): void
  onHandCount: (() => void) | null
}) {
  const text = refusalText(props.refusal)
  return (
    <BottomSheet
      open
      onClose={props.onRetry}
      title={
        <>
          <span className={styles.sheetIconWarn}>{REFUSAL_ICONS[text.icon]}</span>
          {text.title}
        </>
      }
    >
      <p className={styles.sheetText}>{text.body}</p>
      <p className={styles.sheetNote}>Nothing was saved.</p>
      {props.cryOff && props.refusal !== 'crying' && <CryOffNote reason={props.cryOff} />}
      <div className={styles.sheetActions}>
        <Button icon={<ArrowClockwiseIcon size={22} weight="bold" aria-hidden />} tagalog="Subukan ulit" onClick={props.onRetry}>
          Try again
        </Button>
        {props.onHandCount && (
          <Button variant="secondary" icon={<TimerIcon size={22} weight="bold" aria-hidden />} onClick={props.onHandCount}>
            Count by hand with a timer
          </Button>
        )}
      </div>
    </BottomSheet>
  )
}

// 3c and 3d: a dark screen with the top bar, and the sheet.
function NoCameraScreen({ onCancel, backLabel, children }: { onCancel(): void; backLabel: string; children: ReactNode }) {
  return (
    <div className={cx(styles.camera, 'on-night')}>
      <div className={styles.cameraBar}>
        <FlowTopBar dark backKind="close" backLabel={backLabel} onBack={onCancel} />
      </div>
      <h1 className="visually-hidden">Hinga breathing check</h1>
      {children}
    </div>
  )
}

// 3c: shown once, before the browser's camera and microphone prompt.
export function PrePermissionScreen({ onContinue, onCancel }: { onContinue(): void; onCancel(): void }) {
  return (
    <NoCameraScreen onCancel={onCancel} backLabel="Cancel the check">
      <BottomSheet
        open
        onClose={onCancel}
        title={
          <>
            <span className={styles.sheetIcon}>
              <CameraIcon size={24} weight="bold" aria-hidden />
            </span>
            Next, allow the camera and microphone
          </>
        }
      >
        <p className={styles.sheetText}>
          The camera counts breaths. The microphone listens for crying. Nothing is recorded, and nothing leaves this phone.
        </p>
        <Button onClick={onContinue}>Continue</Button>
      </BottomSheet>
    </NoCameraScreen>
  )
}

// 3d: permission denied, or no camera. The fallback is counting by hand.
export function CameraBlockedScreen({ onHandCount, onRetry, onClose }: { onHandCount(): void; onRetry(): void; onClose(): void }) {
  return (
    <NoCameraScreen onCancel={onClose} backLabel="Close">
      <BottomSheet
        open
        onClose={onClose}
        title={
          <>
            <span className={styles.sheetIcon}>
              <CameraSlashIcon size={24} weight="bold" aria-hidden />
            </span>
            The camera is blocked
          </>
        }
      >
        <p className={styles.sheetText}>
          Hinga can't count without it. To allow it, open this site's settings in your browser and turn on Camera.
        </p>
        <div className={styles.sheetActions}>
          <Button icon={<TimerIcon size={22} weight="bold" aria-hidden />} onClick={onHandCount}>
            Count by hand with a timer
          </Button>
          <Button variant="text" onClick={onRetry}>
            I turned it on: try again
          </Button>
        </div>
      </BottomSheet>
    </NoCameraScreen>
  )
}

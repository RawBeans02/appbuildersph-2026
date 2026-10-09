import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  ClockIcon,
  DeviceMobileIcon,
  DownloadSimpleIcon,
  HardDrivesIcon,
  WifiSlashIcon,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFlowMode } from '../../app/flow'
import { navigate } from '../../app/router'
import { BottomSheet, Button, ButtonLink, Progress } from '../../components'
import { cx } from '../../components/cx'
import { warmUpReader } from '../../inference/ocr/ocrClient'
import { getStorageEstimate } from '../../lib/capabilities'
import { formatFreeSpace, formatMB } from '../../lib/format'
import { isModelCached } from '../../lib/modelCache'
import { partsWithModels, type PartWithModels } from '../../lib/modelParts'
import { modelBytes, offlineModels } from '../../lib/offlineModels'
import { useModelDownload } from '../../lib/useModelDownload'
import styles from './PreparePage.module.css'

// "Prepare for offline" (design L1a intro, L3 keep files, L1b downloading,
// L2 not enough space, L9a download stopped, L4 getting ready, then Home).
// Sizes are the registered models' exact bytes; free space from the browser.

const phoneParts = partsWithModels(offlineModels.filter((model) => model.device === 'phone'))
const phoneModels = phoneParts.flatMap((part) => part.models)
const totalBytes = modelBytes(phoneModels)
const mbNumber = (bytes: number) => (bytes / 1e6).toFixed(1)

type PartState = 'done' | 'downloading' | 'waiting'

function PartRows({ parts, states }: { parts: PartWithModels[]; states: PartState[] }) {
  // A part's "Done" check stamps only when it finishes while these rows are
  // shown; parts already on the phone when they appear show still.
  const [doneAtStart] = useState(() => new Set(parts.filter((_, i) => states[i] === 'done').map((part) => part.key)))
  return (
    <div className={styles.list}>
      {parts.map((part, i) => {
        const state = states[i]
        return (
          <div key={part.key} className={cx(styles.stateRow, state === 'waiting' && styles.waiting, state === 'done' && styles.done)}>
            <span className={styles.stateIcon} aria-hidden>
              {state === 'done' ? (
                <CheckCircleIcon className={cx(!doneAtStart.has(part.key) && 'stamp')} size={22} weight="bold" />
              ) : state === 'downloading' ? (
                <CircleNotchIcon className="spin" size={22} weight="bold" />
              ) : (
                <ClockIcon size={22} weight="bold" />
              )}
            </span>
            <span className={styles.stateName}>{part.title}</span>
            <span className={styles.stateLabel}>{state === 'done' ? 'Done' : state === 'downloading' ? 'Downloading' : 'Waiting'}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function PreparePage() {
  useFlowMode(true)
  const { state, start, cancel, retry } = useModelDownload(phoneModels)
  const [askKeep, setAskKeep] = useState(false)
  const [freeBytes, setFreeBytes] = useState<number | null>(null)
  const [cachedParts, setCachedParts] = useState<Set<string>>(new Set())
  // 'ready-at-start': opened when everything was already on the phone.
  const [phase, setPhase] = useState<'flow' | 'warming' | 'warm-failed' | 'ready-at-start'>('flow')
  const startedHere = useRef(false)

  useEffect(() => {
    void getStorageEstimate().then((estimate) => setFreeBytes(estimate?.availableBytes ?? null))
    void Promise.all(
      phoneParts.map(async (part) => ((await Promise.all(part.models.map((m) => isModelCached(m).catch(() => false)))).every(Boolean) ? part.key : null)),
    ).then((keys) => setCachedParts(new Set(keys.filter((key): key is NonNullable<typeof key> => key !== null))))
  }, [])

  // After a download here: L4 while the box reader loads into memory, then Home.
  useEffect(() => {
    if (state.status !== 'ready') return
    if (!startedHere.current) {
      setPhase('ready-at-start')
      return
    }
    setPhase('warming')
    let cancelled = false
    warmUpReader().then(
      () => !cancelled && navigate('/', { replace: true }),
      () => !cancelled && setPhase('warm-failed'),
    )
    return () => {
      cancelled = true
    }
  }, [state.status])

  const partStates = useMemo<PartState[]>(() => {
    const currentPart = state.status === 'downloading' && state.modelId ? phoneParts.findIndex((part) => part.ids.includes(state.modelId!)) : -1
    return phoneParts.map((part, i) => {
      if (cachedParts.has(part.key) || state.status === 'ready' || state.status === 'verifying') return 'done'
      if (currentPart === -1) return i === 0 ? 'downloading' : 'waiting'
      return i < currentPart ? 'done' : i === currentPart ? 'downloading' : 'waiting'
    })
  }, [state, cachedParts])

  function begin() {
    setAskKeep(false)
    startedHere.current = true
    void start()
  }

  const root = (children: React.ReactNode) => (
    <div className={styles.page} data-prepare-status={state.status}>
      {children}
    </div>
  )

  // Already on this phone when the screen opened.
  if (phase === 'ready-at-start') {
    return root(
      <>
        <div className={styles.content}>
          <span className={styles.icon} aria-hidden>
            <DeviceMobileIcon size={32} weight="bold" />
          </span>
          <h1 className={styles.title}>Runs on this phone</h1>
          <p className={styles.lead}>The AI is saved on this phone and works with no signal. What you record stays here.</p>
          <div className={styles.list}>
            {phoneParts.map((part) => (
              <div key={part.key} className={styles.readyRow}>
                {part.title}
                <span className={styles.ready}>
                  <CheckCircleIcon size={18} weight="bold" aria-hidden />
                  Ready
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.footer}>
          <ButtonLink to="/">Go to Home</ButtonLink>
        </div>
      </>,
    )
  }

  if (phase === 'warming' || state.status === 'verifying') {
    return root(
      <div className={cx(styles.content, styles.centered)}>
        <h1 className={styles.title}>Getting the AI ready</h1>
        <div className={styles.progress}>
          <Progress value={null} label={<span className="visually-hidden">Loading</span>} />
        </div>
        <p className={styles.body}>Loading it into this phone's memory. This takes a few seconds.</p>
      </div>,
    )
  }

  if (phase === 'warm-failed') {
    return root(
      <>
        <div className={cx(styles.content, styles.centered)}>
          <span className={cx(styles.icon, styles.iconBad)} aria-hidden>
            <WifiSlashIcon size={32} weight="bold" />
          </span>
          <h1 className={styles.title}>The box reader couldn't start</h1>
          <p className={styles.body}>Its files are on this phone, but it didn't load. Closing other apps usually fixes this.</p>
        </div>
        <div className={styles.footer}>
          <Button tagalog="Subukan ulit" icon={<ArrowClockwiseIcon size={22} weight="bold" aria-hidden />} onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </>,
    )
  }

  if (state.status === 'error' && state.code === 'insufficient-storage') {
    const needed = state.storage?.requiredBytes ?? totalBytes
    const free = state.storage?.availableBytes ?? null
    return root(
      <>
        <div className={cx(styles.content, styles.centered)}>
          <span className={styles.icon} aria-hidden>
            <HardDrivesIcon size={32} weight="bold" />
          </span>
          <h1 className={styles.title}>Not enough space on this phone</h1>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>AgapayMo needs</div>
              <div className={styles.statValue}>{formatMB(needed)}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Free now</div>
              <div className={styles.statValue}>{free === null ? '–' : formatMB(free)}</div>
            </div>
          </div>
          {free !== null && (
            <p className={styles.body}>
              Free up about {Math.ceil((needed * 1.1 - free) / 1e6)} MB, then check again. Deleting old videos or an app you don't
              use is usually enough.
            </p>
          )}
        </div>
        <div className={styles.footer}>
          <Button icon={<ArrowClockwiseIcon size={22} weight="bold" aria-hidden />} onClick={() => void retry()}>
            Check again
          </Button>
          <div className={styles.later}>
            <Button variant="text" onClick={() => navigate('/')}>
              Use AgapayMo without the AI for now
            </Button>
          </div>
        </div>
      </>,
    )
  }

  if (state.status === 'error') {
    const lastLoaded = state.loadedBytes ?? 0
    const percent = Math.floor((lastLoaded / totalBytes) * 100)
    return root(
      <>
        <div className={cx(styles.content, styles.centered)}>
          <span className={cx(styles.icon, styles.iconBad)} aria-hidden>
            <WifiSlashIcon size={32} weight="bold" />
          </span>
          <h1 className={styles.title}>The download stopped</h1>
          <p className={styles.body}>
            The signal dropped at {mbNumber(lastLoaded)} of {mbNumber(totalBytes)} MB. Connect to Wi-Fi or mobile data, then try
            again. What already downloaded is kept.
          </p>
          <div className={styles.progress}>
            <Progress
              value={lastLoaded / totalBytes}
              label={<span className="visually-hidden">Downloaded so far</span>}
              detail={`${mbNumber(lastLoaded)} / ${mbNumber(totalBytes)} MB · ${percent}%`}
            />
          </div>
        </div>
        <div className={styles.footer}>
          <Button tagalog="Subukan ulit" icon={<ArrowClockwiseIcon size={22} weight="bold" aria-hidden />} onClick={() => void retry()}>
            Try again
          </Button>
        </div>
      </>,
    )
  }

  if (state.status === 'downloading' || state.status === 'checking-storage') {
    const loaded = state.status === 'downloading' ? state.loadedBytes : 0
    const total = state.status === 'downloading' ? state.totalBytes : totalBytes
    const index = partStates.indexOf('downloading')
    const percent = total ? Math.floor((loaded / total) * 100) : 0
    return root(
      <>
        <div className={styles.content}>
          <h1 className={styles.title}>Downloading the AI</h1>
          <p className={styles.lead}>So AgapayMo works without internet. Keep this screen open.</p>
          <div className={styles.progress}>
            <Progress
              value={total ? loaded / total : null}
              label={index >= 0 ? `${index + 1} of ${phoneParts.length}: ${phoneParts[index].short}` : 'Checking the space on this phone'}
              detail={`${mbNumber(loaded)} / ${mbNumber(total)} MB`}
            />
          </div>
          <p className={styles.percent} aria-hidden>
            {percent}%
          </p>
          <PartRows parts={phoneParts} states={partStates} />
        </div>
        <div className={styles.footer}>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </>,
    )
  }

  // L1a: what and why (idle).
  return root(
    <>
      <div className={styles.content}>
        <h1 className={styles.title}>Get AgapayMo ready for no signal</h1>
        <p className={styles.lead}>Download the AI once, so AgapayMo works without internet. After this, nothing you do needs a signal.</p>
        <div className={styles.list}>
          {phoneParts.map((part) => (
            <div key={part.key} className={styles.part}>
              <div>
                <div className={styles.partTitle}>{part.title}</div>
                <div className={styles.partMeta}>{part.description}</div>
              </div>
              <span className={styles.size}>{formatMB(modelBytes(part.models))}</span>
            </div>
          ))}
          <div className={styles.total}>
            <span>Total, one time</span>
            <span className={styles.totalSize}>{formatMB(totalBytes)}</span>
          </div>
        </div>
        <p className={styles.note}>
          Use Wi-Fi if you can.{freeBytes !== null && ` This phone has ${formatFreeSpace(freeBytes)} free.`}
        </p>
      </div>
      <div className={styles.footer}>
        <Button tagalog="I-download" icon={<DownloadSimpleIcon size={22} weight="bold" aria-hidden />} onClick={() => setAskKeep(true)}>
          Download {formatMB(totalBytes)}
        </Button>
        <div className={styles.later}>
          <Button variant="text" onClick={() => navigate('/')}>
            Later
          </Button>
        </div>
      </div>
      <BottomSheet open={askKeep} onClose={() => setAskKeep(false)} title="Next, your browser may ask to keep AgapayMo's files">
        <p className={styles.body}>Tap Allow, so the AI isn't deleted when the phone runs low on space.</p>
        <Button onClick={begin}>Continue</Button>
      </BottomSheet>
    </>,
  )
}

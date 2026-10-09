import {
  CaretRightIcon,
  DownloadSimpleIcon,
  PackageIcon,
  QrCodeIcon,
  UsersThreeIcon,
  WindIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFlowMode } from '../../app/flow'
import { Link } from '../../app/Link'
import { BrandTile, Button, LocalStatus, LoopArt } from '../../components'
import { cx } from '../../components/cx'
import { usePlace } from '../../data/db/usePlace'
import { formatMB } from '../../lib/format'
import { modelBytes, offlineModels } from '../../lib/offlineModels'
import { useModelsPrepared } from '../../lib/useModelsPrepared'
import { closeIntro } from './introSeen'
import { IntroArt } from './IntroArt'
import styles from './Intro.module.css'

// The first-run intro (design pass 2, A1): 0a who it's for, 0b what you can
// do, 0c works with no signal. A full-screen layer over Home, one card at a
// time, moved through with the buttons (never on its own). introSeen.ts
// decides when it shows. The cards carry no stats.

const TOTAL = 3

const FEATURES: { icon: Icon; title: string; text: string; to: string }[] = [
  {
    icon: UsersThreeIcon,
    title: 'Keep a flood watch list',
    text: 'Mark who waded in floodwater. The list shows who to ask about fever, muscle pain or red eyes, from day 5 to day 15.',
    to: '/watch',
  },
  {
    icon: PackageIcon,
    title: 'Read medicine boxes',
    text: 'Take a photo of the box. The phone reads the lot and expiry, and you check them before saving.',
    to: '/stock',
  },
  {
    icon: WindIcon,
    title: "Check a child's breathing · Hinga",
    text: "The camera counts breaths for one minute and applies the cut-off for the child's age. Screening aid only.",
    to: '/hinga',
  },
  {
    icon: QrCodeIcon,
    title: 'Report to the municipality by QR',
    text: 'Show a QR to the RHU laptop. Only counts leave, never names. Instructions come back the same way.',
    to: '/send',
  },
]

// The I2 loop's labels, under its nodes in order.
const LOOP = ['This phone', 'QR', 'RHU laptop', 'QR', 'This phone']

// The phone's offline models, the same byte total Prepare downloads.
const PHONE_AI_BYTES = modelBytes(offlineModels.filter((model) => model.device === 'phone'))

export default function Intro() {
  const [step, setStep] = useState(1)
  const layerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()

  // No bottom nav while it's open.
  useFlowMode(true)

  // Modal: Home behind it can't be reached, Escape is Skip, and focus goes
  // back where it was (or to the page) when it closes.
  useEffect(() => {
    const root = document.getElementById('root')
    const previous = document.activeElement
    root?.setAttribute('inert', '')
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Not when a sheet opened from here (LocalStatus's) has the key.
      const target = event.target as Node
      if (target === document.body || layerRef.current?.contains(target)) closeIntro()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      root?.removeAttribute('inert')
      if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected) previous.focus()
      else document.getElementById('main')?.focus()
    }
  }, [])

  // Each card's headline takes focus, so a screen reader starts there.
  useEffect(() => {
    titleRef.current?.focus()
  }, [step])

  const title = (className: string, text: ReactNode) => (
    <h1 ref={titleRef} id={titleId} tabIndex={-1} className={className}>
      <span className="visually-hidden">
        Step {step} of {TOTAL}.{' '}
      </span>
      {text}
    </h1>
  )
  const next = () => setStep((current) => Math.min(current + 1, TOTAL))

  return createPortal(
    <div ref={layerRef} className={styles.layer} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={styles.frame}>
        <div className={styles.top}>
          <span className={styles.segments} aria-hidden>
            {Array.from({ length: TOTAL }, (_, i) => (
              <span key={i} className={styles.segment}>
                {/* A segment fills as the user reaches it; the first is there on open. */}
                {i < step && <span className={cx(styles.segmentOn, i > 0 && 'fill')} />}
              </span>
            ))}
          </span>
          <button type="button" className={styles.skip} onClick={closeIntro}>
            Skip
          </button>
        </div>

        {/* A new card rises only because Next was tapped, never on first open. */}
        <div key={step} className={cx(styles.card, step > 1 && 'rise')}>
          {step === 1 && (
            <>
              <div className={styles.content}>
                <p className={styles.brand}>
                  <BrandTile size={32} />
                  AgapayMo
                </p>
                <IntroArt className={styles.hero} />
                {title(styles.display, 'Health checks after a typhoon, kahit walang signal.')}
                <p className={styles.body}>
                  AgapayMo is for barangay health workers. It helps you keep track of who to check, what medicine you
                  have, and what your barangay needs from the RHU.
                </p>
              </div>
              <div className={styles.footer}>
                <Button tagalog="Susunod" onClick={next}>
                  Next
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className={styles.content}>
                {title(styles.title, 'What you can do with AgapayMo')}
                <ul className={styles.rows}>
                  {FEATURES.map(({ icon: RowIcon, title: rowTitle, text, to }) => (
                    <li key={to}>
                      <Link to={to} className={styles.row} onClick={closeIntro}>
                        <span className={styles.rowIcon} aria-hidden>
                          <RowIcon size={24} weight="bold" />
                        </span>
                        <span>
                          <span className={styles.rowTitle}>{rowTitle}</span>
                          <span className={styles.rowText}>{text}</span>
                        </span>
                        <CaretRightIcon className={styles.caret} size={22} weight="bold" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.footer}>
                <Button tagalog="Susunod" onClick={next}>
                  Next
                </Button>
              </div>
            </>
          )}

          {step === 3 && <NoSignalCard title={title(styles.title, 'Works with no signal')} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// 0c: the loop, what stays and what leaves, whether the AI is here yet, and
// where the sample data starts.
function NoSignalCard({ title }: { title: ReactNode }) {
  const prepared = useModelsPrepared('phone')
  const place = usePlace()

  return (
    <>
      <div className={styles.content}>
        {title}
        <div className={styles.loop}>
          <LoopArt labels={LOOP} draw />
        </div>
        <p className={styles.body}>
          The AI runs on this phone and your records stay here. Only name-free counts leave, in a QR you show to the RHU
          laptop. The approved plan comes back the same way. After the one-time download, none of it needs internet.
        </p>
        {prepared === true && (
          <div className={styles.status}>
            <LocalStatus />
          </div>
        )}
        {prepared === false && (
          <Link to="/prepare" className={styles.prepare} onClick={closeIntro}>
            <DownloadSimpleIcon className={styles.prepareIcon} size={22} weight="bold" aria-hidden />
            Get the AI ready first: {formatMB(PHONE_AI_BYTES)}, once, on Wi-Fi
          </Link>
        )}
      </div>
      <div className={styles.footer}>
        <Button tagalog="Simulan" onClick={closeIntro}>
          Start
        </Button>
        {place.sample && place.barangay && place.municipality && (
          <p className={styles.caption}>
            You'll start in {place.barangay}, a sample barangay in {place.municipality}. Every name and number in it is
            made up. Sample data (DEMO).
          </p>
        )}
      </div>
    </>
  )
}

import {
  CameraIcon,
  CameraSlashIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  ClockIcon,
  InfoIcon,
  ScanIcon,
  SealCheckIcon,
  TableIcon,
  WarningCircleIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useCallback, useState, type ReactNode } from 'react'
import { Button, ButtonLink, CheckLines, Pill, StateBlock } from '../../components'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery } from '../../data/db/useDbQuery'
import { formatClock, nameOf } from './counts'
import { newestScanned } from './justReceived'
import { LaptopFrame } from './LaptopFrame'
import { ensureMunicipalSample, pairDevice, readHandoff, receiveScan } from './municipal'
import { plainBanner, scanBanner, type ScanBanner } from './scan/banner'
import type { ScanOutcome } from './scan/classify'
import { ScanFallback } from './scan/ScanFallback'
import { useQrScanner, type ScannerState } from './scan/useQrScanner'
import styles from './ScanPage.module.css'
import { barangaySlots, hasSampleData, type Slots } from './slots'
import { useArrivals } from './useArrivals'
import { reportWeek, weekDaysLabel } from './week'

// Screens 16–17: the municipal home (camera off until the officer asks), and
// scanning the barangays' QRs. The webcam stays on between scans; each result
// shows as a panel above the camera with the checks this laptop ran (17g,
// 17h). Decoding and signature checks run on this laptop.

type PairOutcome = Extract<ScanOutcome, { kind: 'pair' }>

const readScanScreen = async (db: AgapayDb) => {
  await ensureMunicipalSample(db)
  return readHandoff(db)
}

// 17f, the camera blocked: a neutral banner with Try again in it. The camera
// states that aren't designed get the same look.
// NEEDS DESIGN (TASKS.md B5-UI): no camera, no camera API, other errors.
const CAMERA_PROBLEM: Partial<Record<ScannerState['status'], { title: string; body: string }>> = {
  denied: { title: 'The camera is blocked', body: 'Allow the camera for this site in the browser settings, then try again.' },
  'no-camera': { title: 'No camera found', body: 'Use a photo of the QR or paste its text below.' },
  unsupported: { title: "This browser can't use the camera here", body: 'Use a photo of the QR or paste its text below.' },
  error: { title: "The camera didn't start", body: 'Close other apps or tabs using the camera, then try again.' },
}

export default function ScanPage() {
  const data = useDbQuery(['pairedDevices', 'receivedPayloads'], readScanScreen)
  const [banner, setBanner] = useState<ScanBanner | null>(null)
  // Counts the results shown, so each new one opens (rises) afresh.
  const [shown, setShown] = useState(0)
  const [pairing, setPairing] = useState<PairOutcome | null>(null)

  const show = useCallback((next: ScanBanner | null) => {
    setBanner(next)
    setShown((count) => count + 1)
  }, [])

  const onText = useCallback(
    async (text: string) => {
      try {
        const db = await getDb()
        const outcome = await receiveScan(db, text)
        if (outcome.kind === 'pair') {
          setPairing(outcome)
          return
        }
        // "{5} of 5 in" after this QR, so the result shows it at once.
        const handoff = await readHandoff(db)
        const after = barangaySlots(handoff, reportWeek(handoff.received))
        show(scanBanner(outcome, { inCount: { received: after.received, expected: after.expected } }))
      } catch {
        show(plainBanner('not-valid', 'bad', "Couldn't save to this laptop", 'Nothing was lost. Try again.'))
      }
    },
    [show],
  )
  const { state, videoRef, start, stop, decodeFile } = useQrScanner((text) => void onText(text))
  // A fresh camera start clears the last result, so an old result never hides
  // why the camera didn't open.
  const startCamera = () => {
    setBanner(null)
    setPairing(null)
    void start()
  }
  const cameraOn = state.status !== 'idle'

  async function confirmPairing(outcome: PairOutcome) {
    try {
      await pairDevice(await getDb(), outcome)
      const name = nameOf(outcome.pairing.barangay)
      show(plainBanner('received', 'ok', `${name} paired`, 'Now scan the counts QR on its Send screen.'))
    } catch {
      show(plainBanner('not-valid', 'bad', "Couldn't save the pairing", 'Nothing was lost. Try again.'))
    }
    setPairing(null)
  }

  const handoff = data.status === 'ready' ? data.data : null
  const slots = handoff ? barangaySlots(handoff, reportWeek(handoff.received)) : null
  const sample = !!handoff && hasSampleData(handoff.devices)
  // 16b: the newest report scanned on this laptop this session sits on
  // --ok-tint with "Just now" for the visit; a row that just landed plays `land`.
  const scanned = handoff ? newestScanned(handoff.received) : null
  const newest = slots?.slots.find((slot) => scanned && slot.thisWeek?.id === scanned.id)?.barangay
  const landed = banner?.tone === 'ok' ? banner.barangay : undefined
  const [filled, settleFill] = useArrivals(slots ? slots.slots.filter((slot) => slot.thisWeek).map((slot) => slot.barangay) : null)
  const allIn = !!slots && slots.expected > 0 && slots.received === slots.expected

  const list =
    data.status === 'loading' ? (
      <p className={styles.note}>Opening the records on this laptop…</p>
    ) : data.status === 'error' ? (
      <StateBlock tone="error" icon={WarningCircleIcon} title="Couldn't open the records" body="Nothing was lost. Your records are still saved on this laptop.">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </StateBlock>
    ) : null
  const meter = slots && <ReceivedMeter slots={slots} filled={filled} onFilled={settleFill} />
  // The text twin of a result: "{Maligaya-D} received. {5} of 5 barangays in."
  const live = (
    <p role="status" className="visually-hidden">
      {banner?.live ?? ''}
    </p>
  )

  if (!cameraOn) {
    return (
      <LaptopFrame
        active="scan"
        title="Barangay reports"
        sub={slots ? [`Week ${slots.week}`, weekDaysLabel(slots.week), sample ? 'Sample data' : null].filter(Boolean).join(' · ') : undefined}
        purpose="Scan each barangay's QR. This laptop checks it, merges the counts and makes a plan for you to approve. None of it needs internet."
      >
        {live}
        <div className={styles.home}>
          <section className={styles.card} aria-labelledby="scan-heading">
            <h2 id="scan-heading" className={styles.heading}>
              Scan a barangay QR
            </h2>
            <p className={styles.lead}>
              The health worker shows the QR on their phone. Only counts come in: no names, birthdays or addresses.
            </p>
            <div className={styles.cameraOff}>
              <CameraIcon size={36} weight="bold" aria-hidden />
              <span>The camera is off</span>
            </div>
            <div className={styles.cardAction}>
              {/* At 5 of 5 the merged view is the next step, so this turns secondary. */}
              <Button variant={allIn ? 'secondary' : 'primary'} icon={<ScanIcon size={22} weight="bold" aria-hidden />} onClick={startCamera}>
                Scan a barangay QR
              </Button>
            </div>
          </section>
          <section className={styles.received} aria-labelledby="received-heading">
            <ReceivedHeading slots={slots} />
            {meter}
            {list ?? (slots && <HomeSlots slots={slots} newest={newest} />)}
            {slots && (
              <div className={styles.bottomAction}>
                <ButtonLink
                  to="/municipal/merged"
                  variant={allIn ? 'primary' : 'secondary'}
                  icon={<TableIcon size={22} weight="bold" aria-hidden />}
                >
                  Open the merged view ({slots.received} of {slots.expected})
                </ButtonLink>
              </div>
            )}
          </section>
        </div>
      </LaptopFrame>
    )
  }

  const problem = CAMERA_PROBLEM[state.status]
  const success = banner?.tone === 'ok'
  // One panel: the pairing prompt, else the last scan's result (a QR pasted
  // or read from a photo while the camera is out), else the camera problem.
  const problemShown = problem && !pairing && !banner
  const next = success ? (allIn && slots ? `All ${slots.expected} barangays are in.` : 'Ready for the next barangay.') : undefined
  return (
    <LaptopFrame
      active="scan"
      title="Scan a barangay QR"
      sub={
        slots
          ? [`Week ${slots.week}`, `${slots.received} of ${slots.expected} received`, sample ? 'Sample data' : null].filter(Boolean).join(' · ')
          : undefined
      }
    >
      {live}
      <div className={styles.scanning}>
        <div>
          {pairing ? (
            <PairingConfirm outcome={pairing} onConfirm={() => void confirmPairing(pairing)} onCancel={() => setPairing(null)} />
          ) : banner ? (
            <ResultPanel key={shown} banner={banner} next={next} />
          ) : (
            problem && (
              <Banner
                tone="info"
                icon={CameraSlashIcon}
                alert
                title={problem.title}
                body={problem.body}
                action={<Button onClick={startCamera}>Try again</Button>}
              />
            )
          )}
          <div className={cx(styles.camera, (banner || pairing || problem) && styles.cameraShort)} hidden={!!problem}>
            <video ref={videoRef} muted playsInline className={styles.video} aria-label="Camera preview" />
            <div className={cx(styles.target, success && styles.targetOk)} aria-hidden />
          </div>
          {problem ? (
            <div className={cx(styles.controls, styles.controlsRow)}>
              {/* The camera's Try again, while a result has the panel's place. */}
              {!problemShown && (
                <Button variant="secondary" onClick={startCamera}>
                  Try again
                </Button>
              )}
              <Button variant="text" onClick={stop}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              {/* After a received QR, the panel says "Ready for the next barangay." */}
              {!success && state.status === 'scanning' && (
                <>
                  <p role="status" className={styles.looking}>
                    <CircleNotchIcon className="spin" size={22} weight="bold" aria-hidden />
                    Looking for a QR
                  </p>
                  <p className={styles.hint}>Hold the phone's QR inside the square, about a hand's length from the camera.</p>
                </>
              )}
              <div className={styles.controls}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    stop()
                    setBanner(null)
                    setPairing(null)
                  }}
                >
                  Stop the camera
                </Button>
              </div>
            </>
          )}
          <ScanFallback onText={(text) => void onText(text)} decodeFile={decodeFile} />
        </div>
        <section aria-labelledby="received-heading">
          <ReceivedHeading slots={slots} small />
          {meter}
          {list ?? (slots && <ScanSlots slots={slots} newest={newest} landed={landed} />)}
          {slots && banner && (
            <div className={styles.sideAction}>
              {/* 17g at 5 of 5: the merged view becomes the primary. */}
              {allIn ? (
                <ButtonLink to="/municipal/merged" icon={<TableIcon size={22} weight="bold" aria-hidden />}>
                  Open the merged view
                </ButtonLink>
              ) : (
                <ButtonLink to="/municipal/merged" variant="secondary" icon={<TableIcon size={22} weight="bold" aria-hidden />}>
                  Merged view ({slots.received} of {slots.expected})
                </ButtonLink>
              )}
            </div>
          )}
        </section>
      </div>
    </LaptopFrame>
  )
}

function ReceivedHeading({ slots, small }: { slots: Slots | null; small?: boolean }) {
  return (
    <div className={styles.receivedHead}>
      <h2 id="received-heading" className={styles.heading}>
        Received this week
      </h2>
      {slots && (
        <span className={cx(styles.count, small && styles.countSmall)}>
          {slots.received} of {slots.expected}
        </span>
      )}
    </div>
  )
}

// 16b: one segment per barangay in list order, the name under each. The list
// under it says the same in words, so the meter is hidden from screen readers.
// A segment fills when its report lands while the officer watches.
function ReceivedMeter({ slots, filled, onFilled }: { slots: Slots; filled: string[]; onFilled: (barangay: string) => void }) {
  return (
    <div className={styles.meter} aria-hidden>
      {slots.slots.map((slot) => (
        <div key={slot.barangay} className={styles.meterItem}>
          <span
            className={cx(styles.meterSeg, slot.thisWeek ? styles.meterIn : styles.meterWaiting, filled.includes(slot.barangay) && 'fill')}
            onAnimationEnd={() => onFilled(slot.barangay)}
          />
          <span className={styles.meterName}>{slot.name}</span>
        </div>
      ))}
    </div>
  )
}

// Screen 16's list: a status pill per barangay.
function HomeSlots({ slots, newest }: { slots: Slots; newest?: string }) {
  return (
    <ul className={styles.list}>
      {slots.slots.map((slot) => {
        const now = slot.barangay === newest && !!slot.thisWeek
        return (
          <li key={slot.barangay} className={cx(styles.row, now && styles.rowNow)}>
            <div className={styles.rowText}>
              <p className={cx(styles.rowName, !slot.thisWeek && styles.waitingName)}>{slot.name}</p>
              {slot.thisWeek && (
                <p className={styles.rowMeta}>
                  {now ? <span className={styles.justNowWord}>Just now</span> : formatClock(slot.thisWeek.receivedAt)} · export{' '}
                  <span className="mono">#{slot.thisWeek.seq}</span>
                </p>
              )}
            </div>
            {slot.thisWeek ? (
              <Pill tone="ok" onTint={now} icon={<SealCheckIcon size={16} weight="bold" aria-hidden />}>
                Received
              </Pill>
            ) : (
              <Pill tone="neutral" icon={<ClockIcon size={16} weight="bold" aria-hidden />}>
                Waiting
              </Pill>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// Screen 17's narrow list: the time each came in, "Just now" for the newest
// scanned this session; the one that just landed plays `land`.
function ScanSlots({ slots, newest, landed }: { slots: Slots; newest?: string; landed?: string }) {
  return (
    <ul className={cx(styles.list, styles.listNarrow)}>
      {slots.slots.map((slot) => {
        const now = slot.barangay === newest && !!slot.thisWeek
        return (
          <li
            key={slot.barangay}
            className={cx(
              styles.narrowRow,
              now && styles.justNow,
              now && slot.barangay === landed && 'land',
              !slot.thisWeek && styles.waitingRow,
            )}
          >
            <span className={styles.narrowName}>{slot.name}</span>
            {slot.thisWeek ? (
              <span className={styles.receivedAt}>
                <SealCheckIcon size={17} weight="bold" aria-hidden />
                {now ? 'Just now' : formatClock(slot.thisWeek.receivedAt)}
              </span>
            ) : (
              <span className={styles.waitingWord}>Waiting</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const RESULT_ICON = { ok: CheckCircleIcon, info: InfoIcon, bad: WarningCircleIcon } as const

// 17g/17h: one scan's result. The checks show the moment they exist, with no
// wait; the panel rises and the check icons stamp together, once.
function ResultPanel({ banner, next }: { banner: ScanBanner; next?: string }) {
  const TitleIcon = RESULT_ICON[banner.tone]
  return (
    <section className={cx(styles.result, 'rise')} aria-labelledby="result-heading">
      <h2 id="result-heading" className={styles.resultTitle}>
        <TitleIcon size={26} weight="bold" className={styles[`result-${banner.tone}`]} aria-hidden />
        {banner.title}
      </h2>
      {banner.lines.length > 0 && <CheckLines lines={banner.lines} animate />}
      {banner.body && <p className={styles.resultBody}>{banner.body}</p>}
      {next && <p className={styles.resultNext}>{next}</p>}
    </section>
  )
}

const BANNER_ICON = { ok: SealCheckIcon, info: InfoIcon, bad: WarningCircleIcon } as const

function Banner({
  tone,
  icon,
  alert,
  title,
  body,
  action,
  children,
}: {
  tone: ScanBanner['tone']
  // The tone's icon unless given (17f: camera-slash).
  icon?: Icon
  alert?: boolean
  title: string
  body: ReactNode
  // One button at the banner's right edge (17f: Try again).
  action?: ReactNode
  children?: ReactNode
}) {
  const BannerIcon = icon ?? BANNER_ICON[tone]
  return (
    <div
      role={alert || tone === 'bad' ? 'alert' : 'status'}
      className={cx(styles.banner, styles[`banner-${tone}`], action !== undefined && styles.bannerWithAction)}
    >
      <BannerIcon size={26} weight="bold" className={styles.bannerIcon} aria-hidden />
      <div className={styles.bannerText}>
        <p className={styles.bannerTitle}>{title}</p>
        <p className={styles.bannerBody}>{body}</p>
        {children}
      </div>
      {action && <div className={styles.bannerAction}>{action}</div>}
    </div>
  )
}

// Pairing a barangay's phone: the officer compares the fingerprint on both
// screens first. NEEDS DESIGN (TASKS.md B5-UI); shown in the result's place.
function PairingConfirm({ outcome, onConfirm, onCancel }: { outcome: PairOutcome; onConfirm: () => void; onCancel: () => void }) {
  const name = nameOf(outcome.pairing.barangay)
  return (
    <Banner
      tone="info"
      title={`Pair ${name}'s phone?`}
      body={
        <>
          This laptop reads the fingerprint <span className="mono">{outcome.fingerprint}</span>. The phone shows its
          fingerprint under the pairing QR. Pair only if every character matches.
          {outcome.current && ' This replaces the phone paired before, and its QR codes are removed.'}
        </>
      }
    >
      <div className={styles.pairActions}>
        <Button variant="secondary" onClick={onConfirm}>
          They match: pair {name}
        </Button>
        <Button variant="text" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Banner>
  )
}

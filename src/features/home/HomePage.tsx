import { ArrowRightIcon, CircleNotchIcon, DropIcon, FileTextIcon, QrCodeIcon, ShieldCheckIcon, WarningIcon, WindIcon } from '@phosphor-icons/react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link } from '../../app/Link'
import { navigate } from '../../app/router'
import { PHASE2 } from '../../lib/phase2'
import { BottomSheet, BrandTile, ButtonLink, RecordsError, ScreenHeader, StateBlock } from '../../components'
import { cx } from '../../components/cx'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery } from '../../data/db/useDbQuery'
import { placeLine, usePlace } from '../../data/db/usePlace'
import { barangayName } from '../../data/places'
import { dayRange, weekdayMonthDay, weekdayMonthDayPlain } from '../../lib/format'
import { modelBytes, offlineModels } from '../../lib/offlineModels'
import { localToday } from '../../rules/dates'
import { WATCH_END_DAY } from '../../rules/watch'
import { Instructions } from '../return/Instructions'
import { clearJustReceived, readJustReceived } from './justReceived'
import type { HomeSummary } from './summary'
import { TaskList } from './TaskList'
import { breathingLine, taskRows } from './taskRows'
import { useHomeSummary } from './useHomeSummary'
// The first-run intro (0a–0c) is in Home's own chunk: it's the first thing a
// new visitor sees, so a separate chunk would delay the first paint.
import Intro from './Intro'
import { useShowIntro } from './introSeen'
import styles from './HomePage.module.css'

// Phase 2 only (P2-C): approved messages from the municipality, its own chunk.
const MessagesCard = lazy(() => import('../inbox/MessagesCard'))


// Screen 1: Home (pass 2: 1e story-led, 1f without the AI yet, 1g with RHU
// instructions; pass 1: 1b loading, 1c empty, 1d error). Every number comes
// from the records on this phone (useHomeSummary) and the saved instructions.

// 1f: the phone models' real download size.
const PHONE_AI_BYTES = modelBytes(offlineModels.filter((model) => model.device === 'phone'))

const readInstructions = (db: AgapayDb) => db.getReceivedInstructions()

// "Purok 1, 2, 3"
function puroksLine(puroks: string[]): string {
  if (puroks.length === 0) return ''
  const [first, ...rest] = puroks
  return [first, ...rest.map((purok) => purok.replace(/^Purok\s+/, ''))].join(', ')
}

function isEmpty(summary: HomeSummary): boolean {
  return (
    summary.flood === null &&
    summary.watch.active + summary.watch.upcoming === 0 &&
    summary.hingaThisWeek.fast + summary.hingaThisWeek.urgent + summary.hingaThisWeek.refused === 0 &&
    summary.doxycycline.onHand + summary.doxycycline.expired === 0
  )
}

function FloodCard({ flood }: { flood: NonNullable<HomeSummary['flood']> }) {
  const filled = Math.min(flood.day, WATCH_END_DAY)
  return (
    <section className={styles.card} aria-label="Flood watch">
      <div className={styles.cardTop}>
        <span className={styles.cardLabel}>
          <DropIcon size={20} weight="bold" aria-hidden />
          Flood watch
        </span>
        <span>Since {weekdayMonthDay(flood.startedOn)}</span>
      </div>
      <p className={styles.day}>
        Day {flood.day} of {WATCH_END_DAY}
      </p>
      <div className={styles.segments} aria-hidden>
        {Array.from({ length: WATCH_END_DAY }, (_, i) => (
          <span key={i} className={cx(styles.segment, i < filled && styles.segmentOn)} />
        ))}
      </div>
      <div className={styles.cardBottom}>
        <span>{puroksLine(flood.puroks)}</span>
        <span>Watch window {dayRange(flood.windowStart, flood.windowEnd)}</span>
      </div>
    </section>
  )
}

// Under the rows, plainly not a task: no divider, caret or press state.
function BreathingLine({ summary }: { summary: HomeSummary }) {
  const line = breathingLine(summary)
  if (!line) return null
  return (
    <div className={styles.breathing}>
      <p className={styles.breathingLine}>
        <WindIcon className={styles.breathingIcon} size={22} weight="bold" aria-hidden />
        {line.referred}
      </p>
      {line.urgent && (
        <p className={cx(styles.breathingLine, styles.breathingUrgent)}>
          <WarningIcon className={styles.breathingIcon} size={22} weight="bold" aria-hidden />
          {line.urgent}
        </p>
      )}
    </div>
  )
}

function Loading() {
  return (
    <>
      <p className={styles.loading} role="status">
        <CircleNotchIcon className="spin" size={18} weight="bold" aria-hidden />
        Opening the records on this phone…
      </p>
      <div className={styles.skeletonCard} aria-hidden />
      <div className={styles.skeleton} style={{ width: 170, height: 22, margin: '26px 20px 14px' }} aria-hidden />
      <div className={styles.rows} aria-hidden>
        {[[220, 160], [190, 200], [240, 140]].map(([title, meta], i) => (
          <div key={i} className={styles.skeletonRow}>
            <span className={styles.skeleton} style={{ width: 40, height: 40, borderRadius: '50%' }} />
            <span style={{ flex: 1 }}>
              <span className={styles.skeleton} style={{ display: 'block', width: title, maxWidth: '100%', height: 16 }} />
              <span className={styles.skeleton} style={{ display: 'block', width: meta, maxWidth: '100%', height: 12, marginTop: 8 }} />
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

export default function HomePage() {
  const summary = useHomeSummary()
  const saved = useDbQuery(['meta'], readInstructions)
  const place = usePlace()
  const [today] = useState(localToday)
  // 1g: this visit came straight from saving instructions on /receive. Read
  // once; the mark is cleared so a reload shows the row as usual.
  const [justReceived] = useState(readJustReceived)
  const [sheetOpen, setSheetOpen] = useState(false)
  const openSheet = useCallback(() => setSheetOpen(true), [])
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  useEffect(() => {
    if (justReceived) clearJustReceived()
  }, [justReceived])

  const loading = summary.status === 'loading' || saved.status === 'loading'
  const failed = summary.status === 'error'
  const showIntro = useShowIntro()
  const instructions = saved.status === 'ready' ? saved.data : null
  const packet = instructions?.packet

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.brandRow}>
          <span className={styles.brand}>
            <BrandTile size={28} />
            AgapayMo
          </span>
          <button type="button" className={styles.iconButton} aria-label="Privacy and AI" onClick={() => navigate('/privacy')}>
            <ShieldCheckIcon size={26} weight="bold" aria-hidden />
          </button>
        </div>
        <ScreenHeader title={place.barangay ?? 'AgapayMo'} place={placeLine([place.municipality], place.sample) || undefined} />
        <div className={styles.purpose}>
          <p className={styles.purposeLine}>Health checks for your barangay after a typhoon, kahit walang signal.</p>
          <ButtonLink to="/?intro" variant="text" className={styles.howLink}>
            How it works
          </ButtonLink>
        </div>
        {loading ? (
          <Loading />
        ) : summary.status === 'error' ? (
          <RecordsError />
        ) : summary.status === 'ready' && isEmpty(summary.data) && !instructions ? (
          <div className={styles.empty}>
            <StateBlock
              icon={FileTextIcon}
              title="Nothing recorded yet"
              body="Start with a breathing check. When floodwater reaches the barangay, log the flood to start a 15-day leptospirosis watch."
            >
              <Link to="/watch?step=log" className={styles.emptyLink}>
                Log a flood
                <ArrowRightIcon size={20} weight="bold" aria-hidden />
              </Link>
            </StateBlock>
          </div>
        ) : summary.status === 'ready' ? (
          <>
            {summary.data.flood && summary.data.flood.window !== 'over' && <FloodCard flood={summary.data.flood} />}
            <h2 className={styles.today}>Today, {weekdayMonthDayPlain(today)}</h2>
            <TaskList
              rows={taskRows({
                summary: summary.data,
                instructions: instructions && { receivedAt: instructions.receivedAt, actions: instructions.packet.actions.length },
                justReceived,
                today,
                aiBytes: PHONE_AI_BYTES,
              })}
              justReceived={justReceived}
              onOpenInstructions={openSheet}
            />
            <BreathingLine summary={summary.data} />
          </>
        ) : null}
        {saved.status === 'error' && (
          <p role="alert" className={styles.savedError}>
            Saved instructions could not be opened. Try reloading.
          </p>
        )}
        {!loading && (
          <div className={styles.receive}>
            <ButtonLink to="/receive" variant="text" className={styles.receiveLink} icon={<QrCodeIcon size={20} weight="bold" aria-hidden />}>
              Got a QR from the RHU? Scan it
            </ButtonLink>
          </div>
        )}
        {/* 1g's text twin for the row that just landed. */}
        <p className="visually-hidden" role="status">
          {justReceived && instructions && !loading ? 'Instructions from the RHU saved on this phone.' : ''}
        </p>
        {PHASE2 && (
          <Suspense fallback={null}>
            <MessagesCard />
          </Suspense>
        )}
      </div>
      {packet && (
        <BottomSheet
          open={sheetOpen}
          onClose={closeSheet}
          showClose
          title={`Approved instructions for ${barangayName(packet.barangay) ?? packet.barangay}`}
        >
          <div className={styles.sheetInstructions}>
            <Instructions packet={packet} bare />
          </div>
        </BottomSheet>
      )}
      <div className={styles.footer}>
        {failed ? (
          <ButtonLink to="/hinga" variant="secondary" icon={<WindIcon size={24} weight="bold" aria-hidden />}>
            Check breathing
          </ButtonLink>
        ) : (
          <ButtonLink to="/hinga" tagalog="Hinga" icon={<WindIcon size={24} weight="bold" aria-hidden />}>
            Check breathing
          </ButtonLink>
        )}
      </div>
      {showIntro && <Intro />}
    </div>
  )
}

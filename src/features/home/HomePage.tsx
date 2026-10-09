import { ArrowRightIcon, CaretRightIcon, CircleNotchIcon, ClockIcon, DropIcon, FileTextIcon, WindIcon } from '@phosphor-icons/react'
import { lazy, Suspense, useState } from 'react'
import { Link } from '../../app/Link'
import { PHASE2 } from '../../lib/phase2'
import { ButtonLink, RecordsError, ScreenHeader, StateBlock } from '../../components'
import { cx } from '../../components/cx'
import { placeLine, usePlace } from '../../data/db/usePlace'
import { dayRange, monthDay, weekdayMonthDay, weekdayMonthDayPlain } from '../../lib/format'
import { localToday } from '../../rules/dates'
import { WATCH_END_DAY } from '../../rules/watch'
import type { HomeSummary } from './summary'
import { useHomeSummary } from './useHomeSummary'
import { useShowIntro } from './introSeen'
import styles from './HomePage.module.css'
import InstructionsCard from '../return/InstructionsCard'

// Phase 2 only (P2-C): approved messages from the municipality, its own chunk.
const MessagesCard = lazy(() => import('../inbox/MessagesCard'))
// The first-run intro (0a–0c), its own chunk: loaded only when it shows.
const Intro = lazy(() => import('./Intro'))

// Screen 1: Home (1a default, 1b loading, 1c empty, 1d error). Every number
// comes from the records on this phone (useHomeSummary).

const localDay = (iso: string) => {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

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

function Rows({ summary }: { summary: HomeSummary }) {
  const { watch, hingaThisWeek: hinga, doxycycline: doxy } = summary
  const watched = watch.active + watch.upcoming
  return (
    <div className={styles.rows}>
      <Link to="/watch" className={styles.row}>
        <span className={styles.count}>{watched}</span>
        <span>
          <span className={styles.rowTitle}>On the watch list</span>
          <span className={styles.rowMeta}>
            {watch.active} in the window now
            {watch.upcoming > 0 && watch.nextStart ? ` · ${watch.upcoming} start ${monthDay(watch.nextStart)}` : ''}
          </span>
        </span>
        <CaretRightIcon className={styles.caret} size={22} weight="bold" aria-hidden />
      </Link>
      {/* No designed screen to open, so not tappable. */}
      <div className={styles.row}>
        <span className={styles.count}>{hinga.referred}</span>
        <span>
          <span className={styles.rowTitle}>{hinga.referred === 1 ? 'Child with fast breathing' : 'Children with fast breathing'}</span>
          {hinga.lastReferredAt && (
            <span className={styles.rowMeta}>Referred {weekdayMonthDay(localDay(hinga.lastReferredAt))}</span>
          )}
        </span>
        <span />
      </div>
      <Link to="/stock" className={styles.row}>
        <span className={styles.count}>{doxy.onHand}</span>
        <span>
          <span className={styles.rowTitle}>Doxycycline capsules</span>
          {doxy.expiringSoon > 0 && (
            <span className={styles.rowMetaWarn}>
              <ClockIcon size={17} weight="bold" aria-hidden />
              {doxy.expiringSoon} expire within 6 weeks
            </span>
          )}
        </span>
        <CaretRightIcon className={styles.caret} size={22} weight="bold" aria-hidden />
      </Link>
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
        {[[170, 120], [190, 100], [160, 140]].map(([title, meta], i) => (
          <div key={i} className={styles.skeletonRow}>
            <span className={styles.skeleton} style={{ width: 40, height: 34, borderRadius: 8 }} />
            <span style={{ flex: 1 }}>
              <span className={styles.skeleton} style={{ display: 'block', width: title, height: 16 }} />
              <span className={styles.skeleton} style={{ display: 'block', width: meta, height: 12, marginTop: 8 }} />
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

export default function HomePage() {
  const summary = useHomeSummary()
  const place = usePlace()
  const [today] = useState(localToday)
  const failed = summary.status === 'error'
  const showIntro = useShowIntro()

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <ScreenHeader
          title={place.barangay ?? 'AgapayMo'}
          place={placeLine([place.municipality], place.sample) || undefined}
          privacyButton
        />
        {summary.status === 'loading' && <Loading />}
        {summary.status === 'error' && <RecordsError />}
        {summary.status === 'ready' &&
          (isEmpty(summary.data) ? (
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
          ) : (
            <>
              {summary.data.flood && summary.data.flood.window !== 'over' && <FloodCard flood={summary.data.flood} />}
              <h2 className={styles.today}>Today, {weekdayMonthDayPlain(today)}</h2>
              <Rows summary={summary.data} />
            </>
          ))}
        <InstructionsCard />
        {PHASE2 && (
          <Suspense fallback={null}>
            <MessagesCard />
          </Suspense>
        )}
      </div>
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
      {showIntro && (
        <Suspense fallback={null}>
          <Intro />
        </Suspense>
      )}
    </div>
  )
}

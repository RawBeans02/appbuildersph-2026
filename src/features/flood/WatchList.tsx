import {
  ArrowUpRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  DropIcon,
  InfoIcon,
  PlusIcon,
  UsersThreeIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { useCallback, useState } from 'react'
import { BottomSheet, Button, Pill, RecordsError, ScreenHeader, StateBlock, useToast } from '../../components'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import type { Exposure, Resident, WatchCheck, WatchCheckResult } from '../../data/db/types'
import type { DbQueryState } from '../../data/db/useDbQuery'
import { clockTime, monthDay, weekdayMonthDay } from '../../lib/format'
import { localToday } from '../../rules/dates'
import { WATCH_END_DAY, WATCH_START_DAY, watchList, type WatchEntry } from '../../rules/watch'
import styles from './Watch.module.css'
import { recordWatchCheck, rowStatus, type RowStatus } from './watchChecks'
import { higherRiskWords, inDaysWords, kindWords } from './words'

// 9a the watch list, 9b a row's sheet (checked or referred), 9c empty.
// Order comes from watchList(): in the window first, higher risk first, then
// the window closing soonest.

export type ListData = { residents: Resident[]; exposures: Exposure[]; checks: WatchCheck[] }

const TITLE = 'Watch list'

function Loading() {
  return (
    <>
      <p className={styles.loading} role="status">
        <CircleNotchIcon size={18} weight="bold" aria-hidden />
        Opening the records on this phone…
      </p>
      <span className={cx(styles.skeleton, styles.skeletonNote)} aria-hidden />
      <span className={cx(styles.skeleton, styles.skeletonHeading)} aria-hidden />
      <div className={styles.rows} aria-hidden>
        {[170, 190, 160].map((width) => (
          <div key={width} className={styles.skeletonRow}>
            <span className={styles.skeletonText}>
              <span className={cx(styles.skeleton, styles.skeletonTitle)} style={{ width }} />
              <span className={cx(styles.skeleton, styles.skeletonMeta)} style={{ width: width - 50 }} />
            </span>
            <span className={cx(styles.skeleton, styles.skeletonSide)} />
          </div>
        ))}
      </div>
    </>
  )
}

function StatusLine({ status }: { status: RowStatus }) {
  if (!status) return null
  return status.kind === 'checked' ? (
    <span className={cx(styles.status, styles.statusChecked)}>
      <CheckCircleIcon size={16} weight="bold" aria-hidden />
      Checked {clockTime(status.at)}
    </span>
  ) : (
    <span className={styles.status}>
      <ArrowUpRightIcon size={16} weight="bold" aria-hidden />
      Referred to RHU, {monthDay(localToday(status.at))}
    </span>
  )
}

function Row({
  entry,
  resident,
  status,
  today,
  onOpen,
}: {
  entry: WatchEntry
  resident: Resident | undefined
  status: RowStatus
  today: string
  onOpen: () => void
}) {
  const kinds = kindWords(entry.kinds) + (entry.lastExposedOn === today ? ' today' : '')
  return (
    <li>
      <button type="button" className={styles.row} aria-haspopup="dialog" onClick={onOpen}>
        <span className={styles.rowMain}>
          <span className={styles.rowName}>{resident?.name ?? entry.residentId}</span>
          <span className={styles.rowMeta}>{[resident?.householdId, resident?.purok, kinds].filter(Boolean).join(' · ')}</span>
          {(entry.higherRisk || status) && (
            <span className={styles.rowTags}>
              {entry.higherRisk && (
                <Pill tone="warn" icon={<WarningIcon size={16} weight="bold" aria-hidden />}>
                  Higher risk
                </Pill>
              )}
              <StatusLine status={status} />
            </span>
          )}
        </span>
        <span className={styles.rowSide}>
          {entry.phase === 'active' ? (
            <>
              <span className={styles.rowDay}>Day {entry.day}</span>
              <span className={styles.rowSideMeta}>of {WATCH_END_DAY}</span>
            </>
          ) : (
            <>
              <span className={styles.rowStarts}>Starts {monthDay(entry.windowStart)}</span>
              <span className={styles.rowSideMeta}>{inDaysWords(entry.daysToStart)}</span>
            </>
          )}
        </span>
      </button>
    </li>
  )
}

function RowSheet({
  entry,
  resident,
  onClose,
  onRecord,
}: {
  entry: WatchEntry | null
  resident: Resident | undefined
  onClose: () => void
  onRecord: (result: WatchCheckResult) => void
}) {
  const risk = entry ? higherRiskWords(entry.kinds) : null
  const exposed =
    entry && entry.firstExposedOn !== entry.lastExposedOn
      ? `${weekdayMonthDay(entry.firstExposedOn)} to ${weekdayMonthDay(entry.lastExposedOn)}`
      : entry && weekdayMonthDay(entry.firstExposedOn)
  return (
    <BottomSheet open={entry !== null} onClose={onClose} showClose title={resident?.name ?? entry?.residentId}>
      {entry && (
        <div>
          {resident && (
            <p className={styles.sheetSub}>
              {resident.householdId} · {resident.purok}
            </p>
          )}
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>In the floodwater</dt>
              <dd>
                {exposed} · {kindWords(entry.kinds)}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Watch</dt>
              <dd>
                {monthDay(entry.windowStart)} to {monthDay(entry.windowEnd)} · day {entry.day}
              </dd>
            </div>
            {risk && (
              <div className={styles.fact}>
                <dt>Risk</dt>
                <dd className={styles.factWarn}>
                  <WarningIcon size={18} weight="bold" aria-hidden />
                  {risk}
                </dd>
              </div>
            )}
          </dl>
          <p className={styles.sheetNote}>Fever, muscle pain or red eyes? Refer to the RHU physician.</p>
          <div className={styles.sheetActions}>
            <Button icon={<CheckIcon size={22} weight="bold" aria-hidden />} onClick={() => onRecord('no-signs')}>
              Checked today: no signs
            </Button>
            <Button
              variant="secondary"
              icon={<ArrowUpRightIcon size={22} weight="bold" aria-hidden />}
              onClick={() => onRecord('referred')}
            >
              Referred to the RHU
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

export function WatchList({
  data,
  place,
  today,
  onMarkMore,
  onLogFlood,
}: {
  data: DbQueryState<ListData>
  place: string
  today: string
  onMarkMore: () => void
  onLogFlood: () => void
}) {
  const toast = useToast()
  const [openId, setOpenId] = useState<string | null>(null)
  const [writeFailed, setWriteFailed] = useState(false)
  const close = useCallback(() => setOpenId(null), [])

  const header = <ScreenHeader title={TITLE} place={place} />
  if (data.status === 'loading' || data.status === 'error' || writeFailed) {
    return (
      <div className={styles.page}>
        {header}
        {data.status === 'loading' ? <Loading /> : <RecordsError />}
      </div>
    )
  }

  const { residents, exposures, checks } = data.data
  const people = new Map(residents.map((resident) => [resident.id, resident]))
  const entries = watchList(exposures, today).filter((entry) => entry.phase !== 'ended')
  const active = entries.filter((entry) => entry.phase === 'active')
  const upcoming = entries.filter((entry) => entry.phase === 'upcoming')
  const open = entries.find((entry) => entry.residentId === openId) ?? null

  async function record(result: WatchCheckResult) {
    const residentId = openId
    setOpenId(null)
    if (!residentId) return
    try {
      const db = await getDb()
      const check = await recordWatchCheck(db, residentId, result)
      const at = new Date(check.checkedAt)
      toast({
        message: result === 'no-signs' ? `Checked ${clockTime(at)}` : `Referred to RHU, ${monthDay(localToday(at))}`,
        action: { label: 'Undo', onClick: () => void db.watchChecks.delete(check.id).catch(() => setWriteFailed(true)) },
      })
    } catch {
      setWriteFailed(true)
    }
  }

  if (entries.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          {header}
          <div className={styles.empty}>
            <StateBlock
              icon={UsersThreeIcon}
              title="No one on the watch list"
              body={`Log a flood and mark who waded in the water. They show here from day ${WATCH_START_DAY} to day ${WATCH_END_DAY}.`}
            />
          </div>
        </div>
        <div className={cx(styles.footer, styles.plainFooter)}>
          <Button icon={<DropIcon size={22} weight="bold" aria-hidden />} onClick={onLogFlood}>
            Log a flood
          </Button>
        </div>
      </div>
    )
  }

  const section = (title: string, list: WatchEntry[]) =>
    list.length > 0 && (
      <section>
        <h2 className={styles.section}>
          {title}{' '}
          <span className={styles.sectionCount}>{list.length}</span>
        </h2>
        <ul className={styles.rows}>
          {list.map((entry) => (
            <Row
              key={entry.residentId}
              entry={entry}
              resident={people.get(entry.residentId)}
              status={rowStatus(checks, entry.residentId, entry.firstExposedOn, today)}
              today={today}
              onOpen={() => setOpenId(entry.residentId)}
            />
          ))}
        </ul>
      </section>
    )

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {header}
        <p className={styles.note}>
          <InfoIcon className={styles.noteIcon} size={22} weight="bold" aria-hidden />
          Refer to the RHU physician if anyone here has fever, muscle pain or red eyes.
        </p>
        {section('In the window now', active)}
        {section('Starts soon', upcoming)}
      </div>
      <div className={styles.footer}>
        <Button icon={<PlusIcon size={22} weight="bold" aria-hidden />} onClick={onMarkMore}>
          Mark more people exposed
        </Button>
      </div>
      <RowSheet entry={open} resident={open ? people.get(open.residentId) : undefined} onClose={close} onRecord={record} />
    </div>
  )
}

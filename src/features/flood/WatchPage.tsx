import { useState } from 'react'
import { useFlowMode } from '../../app/flow'
import { useToast } from '../../components'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery, type DbQueryState } from '../../data/db/useDbQuery'
import { placeLine, usePlace } from '../../data/db/usePlace'
import { localToday } from '../../rules/dates'
import { watchList } from '../../rules/watch'
import { currentFlood, exposedBefore, groupHouseholds, logFlood, marksOn, puroksOf, saveMarks, type Marks } from './flood'
import { LogFlood, type FloodDraft } from './LogFlood'
import { MarkExposed, type MarkData, type MarkEdits } from './MarkExposed'
import { useWatchSteps } from './steps'
import { readWatchChecks } from './watchChecks'
import { WatchList, type ListData } from './WatchList'
import { peopleWords } from './words'

// /watch: the watch list (9a–9c), and the flood flow (8a log a flood, 8b mark
// who was exposed, 8c confirm). The flow hides the bottom nav.

const STORES = ['residents', 'floodEvents', 'exposures', 'watchChecks'] as const

const readWatchData = async (db: AgapayDb) => {
  const [residents, floods, exposures] = await Promise.all([
    db.residents.list({ limit: 1000 }),
    db.floodEvents.list({ limit: 100 }),
    db.exposures.list({ limit: 1000 }),
  ])
  const checks = await readWatchChecks(db, [...new Set(exposures.map((exposure) => exposure.residentId))])
  return { residents, floods, exposures, checks }
}

type FlowDraft = FloodDraft & {
  // 8a's Next was pressed: 8b marks people for this new flood.
  ready: boolean
}

export default function WatchPage() {
  const data = useDbQuery(STORES, readWatchData)
  const place = usePlace()
  const toast = useToast()
  const [today] = useState(localToday)
  const { step, go, back, finish } = useWatchSteps()
  const [draft, setDraft] = useState<FlowDraft>(() => ({ startedOn: today, puroks: [], ready: false }))
  const [edits, setEdits] = useState<MarkEdits>(() => new Map())
  // 9a: residents the last "Start the watch" put on the list, who weren't on
  // it before. Their rows land with "Added today", for this visit only.
  const [justAdded, setJustAdded] = useState<ReadonlySet<string>>(() => new Set())

  const records = data.status === 'ready' ? data.data : null
  const flood = records ? currentFlood(records.floods) : null
  const households = records ? groupHouseholds(records.residents) : []
  // 8b marks for the new flood from 8a, or more people for the current flood.
  const markMode = draft.ready ? 'new' : flood ? 'more' : null
  // 8b with no flood to mark (e.g. reopened mid-flow): log one first.
  const shown = step === 'mark' && records && !markMode ? 'log' : step
  useFlowMode(shown !== 'list')

  const startLog = () => {
    setDraft({ startedOn: today, puroks: [], ready: false })
    setEdits(new Map())
    go('log')
  }
  const startMore = () => {
    if (!flood) return startLog()
    setDraft((current) => ({ ...current, ready: false }))
    setEdits(new Map())
    go('mark')
  }

  if (shown === 'log') {
    return (
      <LogFlood
        draft={draft}
        onChange={(next) => setDraft({ ...next, ready: false })}
        puroks={records ? puroksOf(records.residents) : []}
        today={today}
        onBack={() => back('list')}
        onNext={() => {
          setDraft((current) => ({ ...current, ready: true }))
          go('mark')
        }}
      />
    )
  }

  if (shown === 'mark') {
    const before: Marks = markMode === 'more' && flood && records ? marksOn(records.exposures, flood.id, households, today) : new Map()
    const markData: MarkData =
      data.status !== 'ready'
        ? { status: data.status }
        : {
            status: 'ready',
            households,
            affected: markMode === 'new' ? draft.puroks : (flood?.puroks ?? []),
            before,
            earlier: markMode === 'more' && flood ? exposedBefore(data.data.exposures, flood.id, households, today) : new Map(),
          }

    const save = async (after: Marks) => {
      const db = await getDb()
      const floodEventId =
        markMode === 'new' || !flood ? (await logFlood(db, { startedOn: draft.startedOn, puroks: draft.puroks })).id : flood.id
      const added = await saveMarks(db, { floodEventId, households, before, after, exposedOn: today })
      const listed = new Set(
        records ? watchList(records.exposures, today).filter((entry) => entry.phase !== 'ended').map((entry) => entry.residentId) : [],
      )
      setJustAdded(
        new Set(
          households
            .filter((household) => after.has(household.id) && !before.has(household.id))
            .flatMap((household) => household.members.map((member) => member.id))
            .filter((id) => !listed.has(id)),
        ),
      )
      setDraft({ startedOn: today, puroks: [], ready: false })
      setEdits(new Map())
      finish()
      if (added > 0) toast({ message: `Watch started for ${peopleWords(added)}.` })
    }

    return (
      <MarkExposed
        data={markData}
        edits={edits}
        onEdit={setEdits}
        today={today}
        onBack={() => back(markMode === 'new' ? 'log' : 'list')}
        onSave={save}
      />
    )
  }

  const listData: DbQueryState<ListData> = data
  return (
    <WatchList
      data={listData}
      place={placeLine(['Leptospirosis watch', place.barangay], place.sample)}
      today={today}
      justAdded={justAdded}
      onMarkMore={startMore}
      onLogFlood={startLog}
    />
  )
}

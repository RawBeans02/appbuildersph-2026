import { useState, type FormEvent } from 'react'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import type { ExposureKind } from '../../data/db/types'
import { useDbQuery } from '../../data/db/useDbQuery'
import { localToday } from '../../rules/dates'
import { watchedCount, watchList, type WatchEntry } from '../../rules/watch'
import { currentFlood, groupHouseholds, logFlood, markHouseholdExposed, undoHouseholdExposure, type Household } from './flood'

// Screens 8-9: log a flood, tap exposed households, and the watch list.
// Plain until design/ lands. NEEDS DESIGN: screens 8-9.

const readWatchData = async (db: AgapayDb) => {
  const [residents, floods, exposures] = await Promise.all([
    db.residents.list({ limit: 1000 }),
    db.floodEvents.list({ limit: 100 }),
    db.exposures.list({ limit: 1000 }),
  ])
  return { residents, floods, exposures }
}

const KIND_LABELS: Record<ExposureKind, string> = {
  waded: 'waded in floodwater',
  'open-wound': 'open wound',
  repeated: 'repeated contact',
}

function describeEntry(entry: WatchEntry): string {
  if (entry.phase === 'upcoming') return `Watch starts in ${entry.daysToStart} day${entry.daysToStart === 1 ? '' : 's'} (${entry.windowStart})`
  if (entry.phase === 'active') return `Watch now, ${entry.daysLeft} day${entry.daysLeft === 1 ? '' : 's'} left (until ${entry.windowEnd})`
  return `Window ended ${entry.windowEnd}`
}

export default function WatchPage() {
  const data = useDbQuery(['residents', 'floodEvents', 'exposures'], readWatchData)
  const [today] = useState(localToday)
  const [floodDate, setFloodDate] = useState(today)
  const [note, setNote] = useState('')
  const [woundHouseholds, setWoundHouseholds] = useState<Set<string>>(new Set())

  if (data.status === 'loading') return <p>Loading…</p>
  if (data.status === 'error') return <p role="alert">Could not read the records on this phone.</p>

  const { residents, floods, exposures } = data.data
  const flood = currentFlood(floods)
  const households = groupHouseholds(residents)
  const names = new Map(residents.map((r) => [r.id, r]))
  const exposedHere = new Set(
    exposures.filter((e) => e.floodEventId === flood?.id).map((e) => names.get(e.residentId)?.householdId),
  )
  const entries = watchList(exposures, today).filter((entry) => entry.phase !== 'ended')

  async function onLogFlood(event: FormEvent) {
    event.preventDefault()
    await logFlood(await getDb(), { startedOn: floodDate, note })
    setNote('')
  }

  async function toggle(household: Household) {
    if (!flood) return
    const db = await getDb()
    if (exposedHere.has(household.id)) {
      await undoHouseholdExposure(db, { floodEventId: flood.id, household })
    } else {
      const kinds: ExposureKind[] = woundHouseholds.has(household.id) ? ['waded', 'open-wound'] : ['waded']
      await markHouseholdExposed(db, { floodEventId: flood.id, household, exposedOn: today, kinds })
    }
  }

  return (
    <>
      <h1>Flood exposure watch</h1>

      <h2>Flood</h2>
      {flood ? (
        <p>
          Flood since {flood.startedOn}
          {flood.note ? `: ${flood.note}` : ''}.
        </p>
      ) : (
        <form onSubmit={(event) => void onLogFlood(event)}>
          <p>
            <label>
              Flood started on <input type="date" value={floodDate} max={today} onChange={(e) => setFloodDate(e.target.value)} required />
            </label>
          </p>
          <p>
            <label>
              Note (optional) <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
            </label>
          </p>
          <button type="submit">Log the flood</button>
        </form>
      )}

      {flood && (
        <>
          <h2>Who waded through floodwater?</h2>
          <p>Tap a household to mark everyone in it exposed today. Tap again to undo.</p>
          {households.length === 0 ? (
            <p>No residents on this phone yet.</p>
          ) : (
            <ul>
              {households.map((household) => (
                <li key={household.id}>
                  <button type="button" aria-pressed={exposedHere.has(household.id)} onClick={() => void toggle(household)}>
                    {household.id}, {household.purok}, {household.members.length} people
                    {exposedHere.has(household.id) ? ': exposed' : ''}
                  </button>{' '}
                  {!exposedHere.has(household.id) && (
                    <label>
                      <input
                        type="checkbox"
                        checked={woundHouseholds.has(household.id)}
                        onChange={(e) =>
                          setWoundHouseholds((current) => {
                            const next = new Set(current)
                            if (e.target.checked) next.add(household.id)
                            else next.delete(household.id)
                            return next
                          })
                        }
                      />{' '}
                      someone has an open wound
                    </label>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <h2>Watch list ({watchedCount(entries)})</h2>
      <p>Days 5 to 15 after contact with floodwater. Anyone who gets a fever in their window: refer to the midwife or RHU.</p>
      {entries.length === 0 ? (
        <p>No one to watch yet.</p>
      ) : (
        <ul>
          {entries.map((entry) => {
            const resident = names.get(entry.residentId)
            return (
              <li key={entry.residentId}>
                {resident?.name ?? entry.residentId} ({resident?.householdId}): {describeEntry(entry)}.
                {entry.higherRisk ? ' Higher risk: ' : ' '}
                {entry.kinds.map((kind) => KIND_LABELS[kind]).join(', ')}.
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

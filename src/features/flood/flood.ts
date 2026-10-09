import type { AgapayDb } from '../../data/db/db'
import type { Exposure, ExposureKind, FloodEvent, Resident } from '../../data/db/types'

// Logging a flood and who was exposed. A household is tapped as exposed, which
// records an exposure for each member; the watch window comes from those
// (src/rules/watch.ts).

export type Household = { id: string; purok: string; members: Resident[] }

export function groupHouseholds(residents: Resident[]): Household[] {
  const byId = new Map<string, Household>()
  for (const resident of residents) {
    const household = byId.get(resident.householdId) ?? { id: resident.householdId, purok: resident.purok, members: [] }
    household.members.push(resident)
    byId.set(resident.householdId, household)
  }
  return [...byId.values()].sort((a, b) => a.purok.localeCompare(b.purok) || a.id.localeCompare(b.id))
}

// The flood being logged now: the latest one that hasn't ended.
export function currentFlood(events: FloodEvent[]): FloodEvent | null {
  return events.filter((event) => event.endedOn === null).sort((a, b) => b.startedOn.localeCompare(a.startedOn))[0] ?? null
}

export async function logFlood(
  db: AgapayDb,
  { startedOn, note }: { startedOn: string; note: string },
  now = new Date(),
): Promise<FloodEvent> {
  const event: FloodEvent = {
    id: crypto.randomUUID(),
    startedOn,
    endedOn: null,
    note: note.trim(),
    createdAt: now.toISOString(),
    sample: false,
  }
  await db.floodEvents.put(event)
  return event
}

// Records an exposure for every member not already exposed in this flood on
// that day. Returns how many it added.
export async function markHouseholdExposed(
  db: AgapayDb,
  input: { floodEventId: string; household: Household; exposedOn: string; kinds: ExposureKind[] },
  now = new Date(),
): Promise<number> {
  const existing = await db.exposures.listBy('byFloodEvent', input.floodEventId, { limit: 1000 })
  const already = new Set(existing.filter((e) => e.exposedOn === input.exposedOn).map((e) => e.residentId))
  const added: Exposure[] = input.household.members
    .filter((member) => !already.has(member.id))
    .map((member) => ({
      id: crypto.randomUUID(),
      floodEventId: input.floodEventId,
      residentId: member.id,
      exposedOn: input.exposedOn,
      kinds: input.kinds.length ? input.kinds : ['waded'],
      createdAt: now.toISOString(),
      sample: false,
    }))
  if (added.length) await db.exposures.putMany(added)
  return added.length
}

// Undoes a mistaken tap: removes this flood's exposures for the household.
export async function undoHouseholdExposure(
  db: AgapayDb,
  { floodEventId, household }: { floodEventId: string; household: Household },
): Promise<number> {
  const members = new Set(household.members.map((member) => member.id))
  const exposures = await db.exposures.listBy('byFloodEvent', floodEventId, { limit: 1000 })
  const remove = exposures.filter((exposure) => members.has(exposure.residentId))
  for (const exposure of remove) await db.exposures.delete(exposure.id)
  return remove.length
}

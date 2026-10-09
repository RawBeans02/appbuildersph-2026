import type { AgapayDb } from '../../data/db/db'
import type { Exposure, ExposureKind, FloodEvent, Resident } from '../../data/db/types'

// Logging a flood and who was exposed. A household is tapped as exposed, which
// records an exposure for each member; the watch window comes from those
// (src/rules/watch.ts).

export type Household = { id: string; purok: string; members: Resident[] }

const byName = new Intl.Collator('en', { numeric: true })

export function groupHouseholds(residents: Resident[]): Household[] {
  const byId = new Map<string, Household>()
  for (const resident of residents) {
    const household = byId.get(resident.householdId) ?? { id: resident.householdId, purok: resident.purok, members: [] }
    household.members.push(resident)
    byId.set(resident.householdId, household)
  }
  return [...byId.values()].sort((a, b) => byName.compare(a.purok, b.purok) || byName.compare(a.id, b.id))
}

// The residents' puroks, in order: "Purok 1", "Purok 2", … "Purok 10".
export function puroksOf(residents: Resident[]): string[] {
  return [...new Set(residents.map((resident) => resident.purok))].sort(byName.compare)
}

// Households by purok for marking (8b): the puroks with floodwater first, then
// the rest, each in order.
export function householdsByPurok(
  households: Household[],
  affected: string[] = [],
): { purok: string; households: Household[] }[] {
  const groups = new Map<string, Household[]>()
  for (const household of households) groups.set(household.purok, [...(groups.get(household.purok) ?? []), household])
  const hit = new Set(affected)
  return [...groups.entries()]
    .sort(([a], [b]) => Number(hit.has(b)) - Number(hit.has(a)) || byName.compare(a, b))
    .map(([purok, list]) => ({ purok, households: list.sort((a, b) => byName.compare(a.id, b.id)) }))
}

// The flood being logged now: the latest one that hasn't ended.
export function currentFlood(events: FloodEvent[]): FloodEvent | null {
  return events.filter((event) => event.endedOn === null).sort((a, b) => b.startedOn.localeCompare(a.startedOn))[0] ?? null
}

export async function logFlood(
  db: AgapayDb,
  { startedOn, note = '', puroks = [] }: { startedOn: string; note?: string; puroks?: string[] },
  now = new Date(),
): Promise<FloodEvent> {
  const event: FloodEvent = {
    id: crypto.randomUUID(),
    startedOn,
    endedOn: null,
    note: note.trim(),
    createdAt: now.toISOString(),
    sample: false,
    puroks: [...new Set(puroks)].sort(byName.compare),
  }
  await db.floodEvents.put(event)
  return event
}

const KIND_ORDER: ExposureKind[] = ['waded', 'open-wound', 'repeated']

// Every mark includes "waded"; kinds are kept in one order.
export function normalizeKinds(kinds: Iterable<ExposureKind>): ExposureKind[] {
  const set = new Set<ExposureKind>(kinds)
  set.add('waded')
  return KIND_ORDER.filter((kind) => set.has(kind))
}

// Records an exposure for every member not already exposed in this flood on
// that day. Returns how many it added. A member exposed on an earlier day gets
// a second day of contact, which the watch list counts as repeated.
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

// The household's exposures in this flood on one day.
async function householdExposuresOn(
  db: AgapayDb,
  { floodEventId, household, exposedOn }: { floodEventId: string; household: Household; exposedOn: string },
): Promise<Exposure[]> {
  const members = new Set(household.members.map((member) => member.id))
  const exposures = await db.exposures.listBy('byFloodEvent', floodEventId, { limit: 1000 })
  return exposures.filter((exposure) => members.has(exposure.residentId) && exposure.exposedOn === exposedOn)
}

// Undoes a mistaken tap: removes this flood's exposures for the household on
// that day only. Contact on any other day stays.
export async function undoHouseholdExposure(
  db: AgapayDb,
  input: { floodEventId: string; household: Household; exposedOn: string },
): Promise<number> {
  const remove = await householdExposuresOn(db, input)
  for (const exposure of remove) await db.exposures.delete(exposure.id)
  return remove.length
}

// Changes the details (open wound, repeated) of the household's exposures in
// this flood on that day.
export async function updateHouseholdKinds(
  db: AgapayDb,
  input: { floodEventId: string; household: Household; exposedOn: string; kinds: ExposureKind[] },
): Promise<number> {
  const kinds = normalizeKinds(input.kinds)
  const update = await householdExposuresOn(db, input)
  if (update.length) await db.exposures.putMany(update.map((exposure) => ({ ...exposure, kinds })))
  return update.length
}

// Marked households and their exposure details: household id → kinds.
export type Marks = Map<string, ExposureKind[]>

// Which households of this flood are marked on `day`, with their details.
// Only that day's exposures count, so contact on an earlier day is never
// shown as a tap that could be undone.
export function marksOn(exposures: Exposure[], floodEventId: string, households: Household[], day: string): Marks {
  const householdOf = new Map(households.flatMap((household) => household.members.map((m) => [m.id, household.id] as const)))
  const kinds = new Map<string, Set<ExposureKind>>()
  for (const exposure of exposures) {
    const household = householdOf.get(exposure.residentId)
    if (exposure.floodEventId !== floodEventId || exposure.exposedOn !== day || !household) continue
    const set = kinds.get(household) ?? new Set<ExposureKind>()
    exposure.kinds.forEach((kind) => set.add(kind))
    kinds.set(household, set)
  }
  return new Map([...kinds].map(([household, set]) => [household, normalizeKinds(set)]))
}

// Households of this flood with contact before `day`: household id → the last
// earlier day of contact.
export function exposedBefore(
  exposures: Exposure[],
  floodEventId: string,
  households: Household[],
  day: string,
): Map<string, string> {
  const householdOf = new Map(households.flatMap((household) => household.members.map((m) => [m.id, household.id] as const)))
  const last = new Map<string, string>()
  for (const exposure of exposures) {
    const household = householdOf.get(exposure.residentId)
    if (exposure.floodEventId !== floodEventId || exposure.exposedOn >= day || !household) continue
    if (!last.has(household) || last.get(household)! < exposure.exposedOn) last.set(household, exposure.exposedOn)
  }
  return last
}

const sameKinds = (a: ExposureKind[], b: ExposureKind[]) =>
  normalizeKinds(a).join() === normalizeKinds(b).join()

// What Confirm writes: households newly marked, unmarked, or with new details.
export function planMarks(before: Marks, after: Marks) {
  const add: [string, ExposureKind[]][] = []
  const update: [string, ExposureKind[]][] = []
  const remove: string[] = []
  for (const [household, kinds] of after) {
    const previous = before.get(household)
    if (!previous) add.push([household, normalizeKinds(kinds)])
    else if (!sameKinds(previous, kinds)) update.push([household, normalizeKinds(kinds)])
  }
  for (const household of before.keys()) if (!after.has(household)) remove.push(household)
  return { add, update, remove }
}

// Writes the marks made on 8b for `exposedOn`. Returns how many people were
// newly marked exposed.
export async function saveMarks(
  db: AgapayDb,
  input: { floodEventId: string; households: Household[]; before: Marks; after: Marks; exposedOn: string },
  now = new Date(),
): Promise<number> {
  const byId = new Map(input.households.map((household) => [household.id, household]))
  const { add, update, remove } = planMarks(input.before, input.after)
  const base = { floodEventId: input.floodEventId, exposedOn: input.exposedOn }
  let added = 0
  for (const [id, kinds] of add) {
    const household = byId.get(id)
    if (household) added += await markHouseholdExposed(db, { ...base, household, kinds }, now)
  }
  for (const [id, kinds] of update) {
    const household = byId.get(id)
    if (household) await updateHouseholdKinds(db, { ...base, household, kinds })
  }
  for (const id of remove) {
    const household = byId.get(id)
    if (household) await undoHouseholdExposure(db, { ...base, household })
  }
  return added
}

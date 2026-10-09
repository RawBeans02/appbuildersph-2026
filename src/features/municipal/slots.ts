import type { PairedDevice, ReceivedPayload } from '../../data/db/types'
import { barangayCodes, nameOf } from './counts'
import { compareExports } from './scan/classify'

// Screens 16–17's "Received this week": one slot per barangay, received when
// its newest QR is for the report week (see reportWeek), waiting otherwise.

export type BarangaySlot = {
  barangay: string
  name: string
  // The newest QR this laptop holds for the barangay, any week.
  latest: ReceivedPayload | null
  // `latest`, when it is for the report week.
  thisWeek: ReceivedPayload | null
}

export type Slots = { week: string; slots: BarangaySlot[]; received: number; expected: number }

export function barangaySlots(
  handoff: { devices: readonly PairedDevice[]; received: readonly ReceivedPayload[] },
  week: string,
): Slots {
  const codes = barangayCodes([...handoff.devices, ...handoff.received].map((item) => item.barangay))
  const slots = codes.map((barangay): BarangaySlot => {
    const latest = handoff.received
      .filter((item) => item.barangay === barangay)
      .reduce<ReceivedPayload | null>((a, b) => (!a || compareExports(b, a) > 0 ? b : a), null)
    return { barangay, name: nameOf(barangay), latest, thisWeek: latest?.epiWeek === week ? latest : null }
  })
  return { week, slots, received: slots.filter((slot) => slot.thisWeek).length, expected: slots.length }
}

// Seeded sample barangays are on this laptop ("Sample data" after the place).
export const hasSampleData = (devices: readonly PairedDevice[]) => devices.some((device) => device.source === 'seed')

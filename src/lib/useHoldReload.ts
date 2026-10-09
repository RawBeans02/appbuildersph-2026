import { useEffect } from 'react'
import { appShell } from './appShell'

// Holds a new version's reload while `active` (input not saved yet, a count
// running), so a deploy never wipes what someone is typing. Released when
// inactive or unmounted; the pending reload then happens.
export function useHoldReload(active = true) {
  useEffect(() => (active ? appShell.holdReload() : undefined), [active])
}

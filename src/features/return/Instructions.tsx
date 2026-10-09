import { barangayName } from '../../data/places'
import { dateTime } from '../../lib/format'
import { formatCount } from '../../qr'
import type { ReturnPacket } from '../../qr/return'
import styles from './Return.module.css'

const name = (code: string) => barangayName(code) ?? code

// The approved instructions: a card with its own heading on /receive, or
// `bare` inside Home's 1g sheet, whose title is the heading.
export function Instructions({ packet, bare }: { packet: ReturnPacket; bare?: boolean }) {
  const details = <>
    <p className={styles.meta}>Week {packet.epiWeek} · {packet.approver} · approved {dateTime(packet.approvedAt)}</p>
    <ol className={styles.actions}>{packet.actions.map((a, i) => <li key={i}>{a.kind === 'doctor-team'
      ? <>Send a doctor team to {name(a.barangay)} first. Watch window: {formatCount(a.watchCount)} residents.</>
      : <>Move up to {formatCount(a.capsules)} capsules from {name(a.from)} to {name(a.to)}.</>}</li>)}</ol>
    <p className={styles.meta}>Stock logistics only, never doses. Receiving instructions does not change inventory or mark actions completed.</p>
  </>
  if (bare) return details
  return <section className={styles.card} aria-label="Approved instructions">
    <h2>Approved instructions for {name(packet.barangay)}</h2>
    {details}
  </section>
}

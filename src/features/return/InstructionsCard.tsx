import { ButtonLink } from '../../components'
import { useDbQuery } from '../../data/db/useDbQuery'
import type { AgapayDb } from '../../data/db/db'
import { Instructions } from './Instructions'
import styles from './Return.module.css'

const read = (db: AgapayDb) => db.getReceivedInstructions()

export default function InstructionsCard() {
  const data = useDbQuery(['meta'], read)
  return <div className={styles.screen}>
    {data.status === 'ready' && data.data && <>
      <p className={styles.meta}>Saved on this phone · Received {new Date(data.data.receivedAt).toLocaleString()}</p>
      <Instructions packet={data.data.packet} />
    </>}
    {data.status === 'error' && <p role="alert" className={styles.error}>Saved instructions could not be opened. Try reloading.</p>}
    <ButtonLink to="/receive" variant="secondary">Receive RHU instructions</ButtonLink>
  </div>
}

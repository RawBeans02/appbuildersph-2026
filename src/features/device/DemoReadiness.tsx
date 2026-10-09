import { ArrowClockwiseIcon, CheckCircleIcon, QuestionIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from '../../app/Link'
import { Button } from '../../components/Button'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import { generateSeed } from '../../data/seed/generate'
import { useShellStatus } from '../../lib/appShell'
import { requestPersistentStorage } from '../../lib/capabilities'
import { lock } from '../lock/useLock'
import { loadMunicipalSample } from '../municipal/municipal'
import { ensureDeviceIdentity, resolvePlace } from '../send/identity'
import { removeStockLot } from '../stock/stock'
import { gatherLaptopFacts, gatherPhoneFacts } from './gatherReadiness'
import { laptopChecks, phoneChecks, type Check, type Fix } from './readiness'
import { resetSampleData } from './resetSampleData'
import styles from './DemoReadiness.module.css'

// "Demo readiness", first on /device: a 10-second check before going on
// stage, on the phone and on the laptop (open /device on each), with a
// one-tap fix where there is one. A dev page: tokens and shared components,
// no designed screen.

type Groups = { phone: Check[]; laptop: Check[] }

const built = new Date(__APP_BUILD__.builtAt)
const builtText = Number.isNaN(built.getTime())
  ? __APP_BUILD__.builtAt
  : built.toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function Row({ check, onFix, busy }: { check: Check; onFix: (fix: Fix) => void; busy: boolean }) {
  const Icon = check.ok === null ? QuestionIcon : check.ok ? CheckCircleIcon : WarningCircleIcon
  const fix = check.fix
  return (
    <li className={cx(styles.row, check.ok === false && styles.bad)}>
      <Icon
        size={24}
        weight="bold"
        role="img"
        className={cx(styles.icon, check.ok === true && styles.iconOk, check.ok === false && styles.iconBad)}
        aria-label={check.ok === null ? 'Unknown' : check.ok ? 'Ready' : 'Not ready'}
      />
      <div className={styles.text}>
        <p className={styles.label}>{check.label}</p>
        <p className={styles.detail}>{check.detail}</p>
        {fix &&
          (fix.kind === 'link' ? (
            <Link to={fix.to} className={styles.fixLink}>
              {fix.label}
            </Link>
          ) : (
            <Button variant="secondary" className={styles.fix} disabled={busy} onClick={() => onFix(fix)}>
              {fix.kind === 'persist'
                ? 'Ask to keep storage'
                : fix.kind === 'reset'
                  ? 'Reset the sample data'
                  : fix.kind === 'remove-lot'
                    ? `Remove ${fix.lot}`
                    : 'Make the signing key'}
            </Button>
          ))}
      </div>
    </li>
  )
}

export function DemoReadiness() {
  const shell = useShellStatus()
  const [groups, setGroups] = useState<Groups | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const check = useCallback(async () => {
    setProblem(null)
    try {
      const db = await getDb()
      const [phone, laptop] = await Promise.all([gatherPhoneFacts(db, shell), gatherLaptopFacts(db)])
      setGroups({ phone: phoneChecks(phone), laptop: laptopChecks(laptop) })
    } catch (error) {
      setProblem(`Couldn't check: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [shell])

  useEffect(() => {
    // The first check runs once the page is up; "Check again" reruns it.
    const timer = window.setTimeout(() => void check(), 0)
    return () => window.clearTimeout(timer)
  }, [check])

  async function fix(action: Fix) {
    setBusy(true)
    setProblem(null)
    try {
      const db = await getDb()
      if (action.kind === 'persist') {
        await requestPersistentStorage()
      } else if (action.kind === 'reset') {
        if (!window.confirm("Reset every record to the sample data dated today? Downloaded models and this phone's pairing are kept.")) return
        await resetSampleData(db, {
          resetPairing: false,
          makeSeed: () => generateSeed(new Date()),
          loadMunicipalSample: (database) => loadMunicipalSample(database),
        })
        await lock.refresh()
      } else if (action.kind === 'remove-lot') {
        await removeStockLot(db, action.id)
      } else if (action.kind === 'make-identity') {
        const place = resolvePlace(await db.getSeedInfo())
        if (!place.ok) throw new Error(place.reason)
        await ensureDeviceIdentity(db, place.barangay)
      }
    } catch (error) {
      setProblem(`The fix didn't work: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
      await check()
    }
  }

  const phoneBad = groups?.phone.filter((c) => c.ok === false).length ?? 0
  return (
    <section className={styles.panel} aria-labelledby="demo-readiness">
      <h2 id="demo-readiness" className={styles.title}>
        Demo readiness
      </h2>
      <p className={styles.version}>
        Build <span className={styles.mono}>{__APP_BUILD__.sha}</span> · built {builtText}. It should match the newest commit
        on main.
      </p>
      {groups === null ? (
        <p role="status" className={styles.detail}>
          Checking this device…
        </p>
      ) : (
        <>
          <p role="status" className={cx(styles.summary, phoneBad ? styles.summaryBad : styles.summaryOk)}>
            {phoneBad ? `On this phone: ${phoneBad} to fix before the demo.` : 'This phone is ready for the demo.'}
          </p>
          <h3 className={styles.group}>On the phone</h3>
          <ul className={styles.rows}>
            {groups.phone.map((item) => (
              <Row key={item.id} check={item} onFix={(action) => void fix(action)} busy={busy} />
            ))}
          </ul>
          <h3 className={styles.group}>On the municipal laptop (open /device there)</h3>
          <ul className={styles.rows}>
            {groups.laptop.map((item) => (
              <Row key={item.id} check={item} onFix={(action) => void fix(action)} busy={busy} />
            ))}
          </ul>
        </>
      )}
      {problem && (
        <p role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
      <Button variant="text" icon={<ArrowClockwiseIcon size={18} weight="bold" aria-hidden />} disabled={busy} onClick={() => void check()}>
        Check again
      </Button>
    </section>
  )
}

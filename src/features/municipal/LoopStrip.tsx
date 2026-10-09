import {
  CheckCircleIcon,
  DeviceMobileIcon,
  ListNumbersIcon,
  QrCodeIcon,
  SealCheckIcon,
  TableIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useMemo } from 'react'
import { cx } from '../../components/cx'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery } from '../../data/db/useDbQuery'
import { loopModel, type LoopStepId } from './loop'
import styles from './LoopStrip.module.css'
import { readApprovalLog, readMunicipalScreen } from './municipal'
import { barangaySlots } from './slots'
import { useArrivals } from './useArrivals'
import { reportWeek } from './week'

// The LoopStrip (design pass 2, A3): the five steps of the loop under every
// laptop screen's title, status only (LaptopNav navigates). It reads the
// records live, so a report landing fills its meter segment, and an approval
// stamps step 4's check and draws the connector to step 5. Nothing moves when
// a screen opens.

const ICONS: Record<LoopStepId, Icon> = {
  reports: DeviceMobileIcon,
  merged: TableIcon,
  plan: ListNumbersIcon,
  approved: SealCheckIcon,
  back: QrCodeIcon,
}

const readLoop = async (db: AgapayDb) => {
  const [screen, log] = await Promise.all([readMunicipalScreen(db), readApprovalLog(db)])
  return { handoff: screen.handoff, plan: screen.plan, log }
}

export function LoopStrip({ current }: { current: LoopStepId | null }) {
  const data = useDbQuery(['pairedDevices', 'receivedPayloads', 'approvals', 'plans'], readLoop)
  const model = useMemo(
    () =>
      data.status === 'ready'
        ? loopModel({
            slots: barangaySlots(data.data.handoff, reportWeek(data.data.handoff.received)),
            plan: data.data.plan,
            log: data.data.log,
          })
        : null,
    [data],
  )
  const [filled, settleFill] = useArrivals(model ? model.meter.filter((seg) => seg.received).map((seg) => seg.barangay) : null)
  const [approved, settleApproved] = useArrivals(model ? (model.approvalId ? [model.approvalId] : []) : null)
  const justApproved = approved.length > 0

  return (
    <div className={styles.band}>
      {model && (
        <ol className={styles.steps} aria-label="This week's reports">
          {model.steps.map((step, i) => {
            const StepIcon = step.state === 'done' ? CheckCircleIcon : ICONS[step.id]
            const isCurrent = step.id === current
            return (
              <li
                key={step.id}
                className={cx(styles.step, styles[step.state], isCurrent && styles.current)}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {i > 0 && (
                  <span className={styles.connector} aria-hidden>
                    <span
                      className={cx(styles.line, step.id === 'back' && justApproved && styles.drawLine)}
                      onAnimationEnd={() => approved.forEach(settleApproved)}
                    />
                    <svg className={styles.arrow} width="7" height="12" viewBox="0 0 7 12" focusable="false">
                      <path d="M1.5 1.5 6 6l-4.5 4.5" />
                    </svg>
                  </span>
                )}
                <span className={styles.body}>
                  <StepIcon
                    size={22}
                    weight="bold"
                    className={cx(styles.icon, step.id === 'approved' && justApproved && 'stamp')}
                    aria-hidden
                  />
                  <span className={styles.text}>
                    <span className={styles.label}>{step.label}</span>
                    <span className={styles.status}>
                      {step.status}
                      {step.id === 'reports' && (
                        <span className={styles.meter} aria-hidden>
                          {model.meter.map((seg) => (
                            <span
                              key={seg.barangay}
                              className={cx(styles.seg, seg.received ? styles.segIn : styles.segWaiting, filled.includes(seg.barangay) && 'fill')}
                              onAnimationEnd={() => settleFill(seg.barangay)}
                            />
                          ))}
                        </span>
                      )}
                    </span>
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

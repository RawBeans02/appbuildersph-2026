import {
  CaretRightIcon,
  ClockIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  FlagIcon,
  PackageIcon,
  QrCodeIcon,
  UsersThreeIcon,
  WarningCircleIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from '../../app/Link'
import { cx } from '../../components/cx'
import type { TaskIcon, TaskRow } from './taskRows'
import styles from './HomePage.module.css'

// Home's task rows (1e): rows with dividers on paper, each one a link (or,
// for the RHU instructions, the button that opens their sheet). Nothing
// moves when Home opens; only the instructions row lands, on the visit
// right after they were saved (1g).

const ICONS: Record<TaskIcon, Icon> = {
  download: DownloadSimpleIcon,
  instructions: FileTextIcon,
  people: UsersThreeIcon,
  expired: WarningCircleIcon,
  expiring: ClockIcon,
  stock: PackageIcon,
  flag: FlagIcon,
  send: QrCodeIcon,
}

const TONES = { neutral: styles.taskIconNeutral, bad: styles.taskIconBad, warn: styles.taskIconWarn }

function Content({ row }: { row: TaskRow }) {
  const RowIcon = ICONS[row.icon]
  return (
    <>
      <span className={cx(styles.taskIcon, TONES[row.tone])} aria-hidden>
        <RowIcon size={24} weight="bold" />
      </span>
      <span className={styles.taskText}>
        <span className={styles.taskTitle}>{row.title}</span>
        <span className={styles.taskMeta}>{row.meta}</span>
      </span>
      <CaretRightIcon className={styles.caret} size={22} weight="bold" aria-hidden />
    </>
  )
}

export function TaskList({
  rows,
  justReceived,
  onOpenInstructions,
}: {
  rows: TaskRow[]
  justReceived: boolean
  onOpenInstructions: () => void
}) {
  // `land` plays once, then the class goes; the tint stays for the visit.
  const [landing, setLanding] = useState(justReceived)
  return (
    <ul className={styles.tasks}>
      {rows.map((row) => (
        <li key={row.key}>
          {row.to ? (
            <Link to={row.to} className={styles.task}>
              <Content row={row} />
            </Link>
          ) : (
            <button
              type="button"
              className={cx(styles.task, justReceived && styles.taskJust, justReceived && landing && 'land')}
              aria-haspopup="dialog"
              onClick={onOpenInstructions}
              onAnimationEnd={() => setLanding(false)}
            >
              <Content row={row} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

import { ArrowClockwiseIcon, CheckIcon, MemoryIcon, TimerIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Button, FlowTopBar, StateBlock } from '../../components'
import styles from './Hinga.module.css'

// No "Runs on this phone" here: the breathing check isn't running.
const NO_STATUS = false

// L8a: no WebAssembly, or the breathing check failed to load twice. Counting
// by hand still works, and so does the rest of AgapayMo.
export function CantRunScreen({ onHandCount, onBack }: { onHandCount(): void; onBack(): void }) {
  return (
    <div className={styles.screen}>
      <FlowTopBar onBack={onBack} right={NO_STATUS} />
      <h1 className="visually-hidden">Hinga breathing check</h1>
      <div className={styles.body}>
        <StateBlock
          tone="warn"
          icon={MemoryIcon}
          title="This phone can't run the camera check"
          body="Its browser can't run the breathing AI. Updating Chrome or Safari may fix this."
        />
        <h2 className={styles.sectionTitle}>You can still</h2>
        <ul className={styles.canList}>
          {['Count breaths by hand with a timer', 'Keep the flood watch list', 'Add medicine stock by typing', 'Send the QR to the RHU'].map(
            (item) => (
              <li key={item}>
                <CheckIcon size={20} weight="bold" aria-hidden />
                {item}
              </li>
            ),
          )}
        </ul>
      </div>
      <div className={styles.footer}>
        <Button icon={<TimerIcon size={22} weight="bold" aria-hidden />} onClick={onHandCount}>
          Count by hand with a timer
        </Button>
      </div>
    </div>
  )
}

// L9b: the files are on the phone but the breathing check didn't load. A
// second failure leads to L8a.
export function DidntLoadScreen({ onRetry, onBack }: { onRetry(): void; onBack(): void }) {
  return (
    <div className={styles.screen}>
      <FlowTopBar onBack={onBack} right={NO_STATUS} />
      <h1 className="visually-hidden">Hinga breathing check</h1>
      <div className={styles.body}>
        <StateBlock
          tone="error"
          icon={WarningCircleIcon}
          title="The breathing check couldn't start"
          body="Its files are on this phone, but it didn't load. Closing other apps usually fixes this."
        />
      </div>
      <div className={styles.footer}>
        <Button icon={<ArrowClockwiseIcon size={22} weight="bold" aria-hidden />} tagalog="Subukan ulit" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  )
}

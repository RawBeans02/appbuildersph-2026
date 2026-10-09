import { ArrowRightIcon, CameraIcon, LockSimpleIcon, MicrophoneIcon, ScanIcon, WarningIcon, type Icon } from '@phosphor-icons/react'
import { useFlowMode } from '../../app/flow'
import { Link } from '../../app/Link'
import { navigate } from '../../app/router'
import { FlowTopBar } from '../../components'
import { PinLockSection } from './PinLockSection'
import styles from './PrivacyPage.module.css'

// Screen 15 / L10, Privacy & AI: what runs on this phone, what leaves it, and
// what the AI can get wrong (design: AgapayMo Local AI States, L10).

const ON_THIS_PHONE: { icon: Icon; title: string; text: string }[] = [
  {
    icon: CameraIcon,
    title: 'Breathing check (Hinga)',
    text: 'Uses the camera to count breaths. The video is never saved.',
  },
  { icon: MicrophoneIcon, title: 'Crying check', text: 'Listens for crying during a count. Sound is never saved.' },
  {
    icon: ScanIcon,
    title: 'Medicine-box reader',
    text: 'Reads the lot and expiry from a photo. The photo is deleted after reading.',
  },
  {
    icon: LockSimpleIcon,
    title: 'Your records',
    text: "Residents, floods, checks and stock stay in this phone's browser storage.",
  },
]

const CAN_GET_WRONG = [
  'It can miscount breaths if the child moves or cries, or the light is poor. When it can tell, it stops and says why.',
  'It can misread a lot number or expiry. You check every field before anything is saved.',
  "On the municipal laptop, AI drafts the plan's wording. The officer checks it before approving.",
]

// Back to wherever the user came from in the app; Home when the page was
// opened on its own.
function goBack() {
  if (window.history.length > 1) window.history.back()
  else navigate('/')
}

export default function PrivacyPage() {
  // The L10 frame has no bottom nav: one way back.
  useFlowMode(true)

  return (
    <>
      <FlowTopBar onBack={goBack} />
      <div className={styles.body}>
        <h1 className={styles.title}>Privacy &amp; AI</h1>

        <h2 className={styles.heading}>What runs on this phone</h2>
        <ul className={styles.parts}>
          {ON_THIS_PHONE.map(({ icon: PartIcon, title, text }) => (
            <li key={title} className={styles.part}>
              <PartIcon className={styles.partIcon} size={24} weight="bold" aria-hidden />
              <div>
                <p className={styles.partTitle}>{title}</p>
                <p className={styles.partText}>{text}</p>
              </div>
            </li>
          ))}
        </ul>

        <h2 className={styles.leavesHeading}>What leaves this phone</h2>
        <p className={styles.text}>
          {
            'Only the counts in the QR code, and only when you show it to the municipal laptop. No names, birthdays or addresses. Counts from 1 to 4 show as “<5”.'
          }
        </p>
        <Link to="/send" className={styles.link}>
          See exactly what the QR holds
          <ArrowRightIcon size={18} weight="bold" aria-hidden />
        </Link>

        <PinLockSection />

        <h2 className={styles.wrongHeading}>What the AI can get wrong</h2>
        <ul className={styles.wrong}>
          {CAN_GET_WRONG.map((line) => (
            <li key={line} className={styles.wrongItem}>
              <WarningIcon className={styles.warnIcon} size={20} weight="bold" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <p className={styles.never}>AgapayMo never diagnoses and never suggests a dose. It counts, flags and refers.</p>
        <p className={styles.footer}>
          Research prototype, not a registered medical device. San Isidro Demo and every record in it are invented sample
          data.
        </p>
      </div>
    </>
  )
}

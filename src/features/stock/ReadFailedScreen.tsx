import { ArrowClockwiseIcon, CameraIcon, PencilSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { Button, ButtonLink, FlowTopBar } from '../../components'
import { cx } from '../../components/cx'
import styles from './ReadFailed.module.css'
import screen from './screen.module.css'

// L9c: the photo was read, but no drug, lot or expiry was found in it.
export function UnreadableScreen({
  photoUrl,
  onBack,
  onScanAgain,
  onTypeIn,
}: {
  photoUrl: string | null
  onBack: () => void
  onScanAgain: () => void
  onTypeIn: () => void
}) {
  const headingRef = useFocusOnMount()
  return (
    <div className={screen.page}>
      <FlowTopBar onBack={onBack} />
      <div className={screen.content}>
        {photoUrl && <img src={photoUrl} alt="The box you photographed" className={cx(screen.photo, screen.photoShort)} />}
        <div className={styles.block}>
          <span className={styles.icon} aria-hidden>
            <WarningCircleIcon size={30} weight="bold" />
          </span>
          <h1 ref={headingRef} tabIndex={-1} className={cx(screen.title, screen.titleStrong, styles.title)}>
            Couldn't read the label
          </h1>
          <p className={styles.body}>The text was too blurry or shiny. Try again, or type it in.</p>
        </div>
      </div>
      <div className={screen.footer}>
        <Button icon={<CameraIcon size={22} weight="bold" aria-hidden />} onClick={onScanAgain}>
          Scan again
        </Button>
        <Button variant="secondary" icon={<PencilSimpleIcon size={22} weight="bold" aria-hidden />} onClick={onTypeIn}>
          Type it in
        </Button>
      </div>
    </div>
  )
}

// L9b, the box reader's version: it didn't load. `prepared` says whether its
// files are on this phone (L9b's line is only true then).
// NEEDS DESIGN: the box reader failing when its files were never downloaded
// (offline before "Prepare for offline"); for now it links to /prepare.
export function ReaderFailedScreen({
  prepared,
  onBack,
  onRetry,
}: {
  prepared: boolean | null
  onBack: () => void
  onRetry: () => void
}) {
  const headingRef = useFocusOnMount()
  return (
    <div className={screen.page}>
      <FlowTopBar onBack={onBack} right={<></>} />
      <div className={screen.content}>
        <div className={cx(styles.block, styles.blockTop)}>
          <span className={cx(styles.icon, styles.iconLarge)} aria-hidden>
            <WarningCircleIcon size={34} weight="bold" />
          </span>
          <h1 ref={headingRef} tabIndex={-1} className={cx(styles.title, styles.titleLarge)}>
            The box reader couldn't start
          </h1>
          {prepared === true && (
            <p className={styles.body}>Its files are on this phone, but it didn't load. Closing other apps usually fixes this.</p>
          )}
        </div>
      </div>
      <div className={screen.footer}>
        <Button tagalog="Subukan ulit" icon={<ArrowClockwiseIcon size={22} weight="bold" aria-hidden />} onClick={onRetry}>
          Try again
        </Button>
        {prepared === false && (
          <ButtonLink to="/prepare" variant="secondary">
            Get Agapay ready for no signal
          </ButtonLink>
        )}
      </div>
    </div>
  )
}

function useFocusOnMount() {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return ref
}

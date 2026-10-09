import { useEffect, useRef } from 'react'
import { Button, FlowTopBar, Progress } from '../../components'
import styles from './Reading.module.css'
import screen from './screen.module.css'

// L6a / L6b: the box is read on this phone, in a worker, in two real steps:
// finding the text (one detection pass, so no fraction to show), then reading
// it line by line (the share of lines read). The first read of a session
// loads the reader first, and says so. Cancel stops the read.

export type ReadingPhase = 'loading' | 'finding' | 'reading'

const STEPS: Record<ReadingPhase, { label: string; detail?: string }> = {
  loading: { label: 'Getting the AI ready' },
  finding: { label: 'Finding the text', detail: 'step 1 of 2' },
  reading: { label: 'Reading the text', detail: 'step 2 of 2' },
}

export function ReadingScreen({
  photoUrl,
  phase,
  fraction,
  onCancel,
}: {
  photoUrl: string | null
  phase: ReadingPhase
  // Lines read so far, 0..1, while reading; null when unknown.
  fraction: number | null
  onCancel: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  const step = STEPS[phase]

  return (
    <div className={screen.page}>
      <FlowTopBar onBack={onCancel} />
      <div className={screen.content}>
        {photoUrl && <img src={photoUrl} alt="The box you photographed" className={screen.photo} />}
        <h1 ref={headingRef} tabIndex={-1} className={`${screen.title} ${styles.title}`}>
          Reading the box
        </h1>
        <div className={styles.progress} aria-live="polite">
          <Progress value={phase === 'reading' ? fraction : null} label={step.label} detail={step.detail} />
        </div>
        <p className={styles.note}>Reading on this phone. The photo is deleted after.</p>
      </div>
      <div className={screen.footer}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

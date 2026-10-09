import { useEffect, useRef, useState } from 'react'
import { FlowTopBar } from '../../components'
import type { AgeBand } from './copy'
import { DangerSignsAction } from './FallbackScreens'
import { clockText, handRate, isDone, msLeft, NOT_STARTED, tap, type HandCount } from './handCount'
import styles from './Hinga.module.css'

// L8b, count by hand: tap once per breath; the clock starts at the first tap
// and the result screens follow at 0:00, marked "Counted by hand". A danger
// sign seen before the minute is up goes straight to the checklist.
export function HandCountScreen(props: { band: AgeBand; onDone(perMin: number): void; onStop(): void; onDangerSigns(): void }) {
  const { band, onDone, onStop } = props
  const [count, setCount] = useState<HandCount>(NOT_STARTED)
  const [left, setLeft] = useState(() => msLeft(NOT_STARTED, 0))
  const countRef = useRef(count)
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  const started = count.startedAt !== null
  useEffect(() => {
    if (!started) return
    const timer = window.setInterval(() => {
      const now = performance.now()
      setLeft(msLeft(countRef.current, now))
      const rate = handRate(countRef.current, now)
      if (rate !== null) {
        window.clearInterval(timer)
        doneRef.current(rate)
      }
    }, 200)
    return () => window.clearInterval(timer)
  }, [started])

  function onTap() {
    const now = performance.now()
    if (isDone(countRef.current, now)) return
    const next = tap(countRef.current, now)
    countRef.current = next
    setCount(next)
    setLeft(msLeft(next, now))
  }

  return (
    <div className={styles.screen}>
      <FlowTopBar
        backKind="text"
        backLabel="Stop"
        onBack={onStop}
        right={
          <span className={styles.timer}>
            <span role="timer" className={styles.clock}>
              {clockText(left)}
            </span>
            <span className={styles.left}>left</span>
          </span>
        }
      />
      <div className={styles.body}>
        <h1 className={styles.title}>Count by hand</h1>
        <p className={styles.handSub}>Watch the chest rise. Tap once for each breath.</p>
        <div className={styles.tapArea}>
          <button type="button" className={styles.tap} aria-label="Tap for each breath" onClick={onTap}>
            <span className={styles.tapCount}>{count.taps}</span>
            <span className={styles.tapLabel}>Tap for each breath</span>
          </button>
          <p className={styles.cutoffLine}>
            {band.label} · fast is {band.cutoff} or more a minute
          </p>
        </div>
      </div>
      <div className={styles.footer}>
        <DangerSignsAction onClick={props.onDangerSigns} />
      </div>
    </div>
  )
}

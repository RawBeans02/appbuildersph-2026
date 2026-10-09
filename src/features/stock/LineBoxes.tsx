import { useState, type CSSProperties } from 'react'
import { cx } from '../../components/cx'
import type { LineFrame } from '../../inference/ocr/ocrClient'
import styles from './LineBoxes.module.css'
import { boxDelay, tagDelay, tagText, type LineMark } from './readLines'

// Screen 11b: the box photo with every line the reader found outlined on it,
// in reading order, and a numbered tag on each line that filled a field. The
// photo is letterboxed; the overlay sits on the picture's own rectangle, so
// the reader's boxes (fractions of the picture) land where it read them. The
// overlay is aria-hidden and never a tap target; the alt text and the
// screen's caption say what it shows.

type Size = { width: number; height: number }

const percent = (fraction: number) => `${fraction * 100}%`

// A tag centered on a box's top-left corner, kept inside the picture.
const corner = (fraction: number) => `clamp(12px, ${percent(fraction)}, calc(100% - 12px))`

// A field's number in an ink circle. The numeral is drawn by CSS, so a field
// label holding the tag keeps the field's name as its whole text (and its
// accessible name); the numbers only point at the photo, which is decorative.
export function NumberTag({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" data-n={text} className={cx(styles.tag, className)} style={style} />
}

export function LineBoxes({
  photoUrl,
  alt,
  frames,
  marks,
  focusedLine,
}: {
  photoUrl: string
  alt: string
  // Every line the reader found, in reading order.
  frames: LineFrame[]
  // The lines that filled a field (readLines.ts).
  marks: Map<number, LineMark>
  // The line of the field being edited: highlighted, the rest dimmed.
  focusedLine: number | null
}) {
  // The picture's own size, for its shape; known once it loads.
  const [size, setSize] = useState<Size | null>(null)
  const count = frames.length
  const dimmed = (index: number) => focusedLine !== null && index !== focusedLine

  return (
    <div
      className={styles.photo}
      style={size ? { aspectRatio: `${size.width} / ${size.height}`, height: 'auto' } : undefined}
    >
      <img
        src={photoUrl}
        alt={alt}
        className={styles.img}
        onLoad={(event) => {
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget
          if (width > 0 && height > 0) setSize({ width, height })
        }}
      />
      {size && (
        <div
          className={styles.stage}
          style={{ width: `min(100%, calc(var(--photo-max) * ${size.width / size.height}))` }}
          aria-hidden="true"
        >
          <svg className={styles.boxes}>
            {frames.map((frame, index) => {
              const rect = {
                x: percent(frame.left),
                y: percent(frame.top),
                width: percent(frame.width),
                height: percent(frame.height),
                rx: 2,
              }
              return (
                <g
                  key={index}
                  className={cx(
                    'reveal',
                    marks.get(index)?.check && styles.check,
                    index === focusedLine && styles.focused,
                    dimmed(index) && styles.dimmed,
                  )}
                  style={{ animationDelay: boxDelay(index, count) }}
                >
                  <rect className={styles.halo} {...rect} />
                  <rect className={styles.outline} {...rect} />
                </g>
              )
            })}
          </svg>
          {[...marks].map(([index, mark]) => (
            <NumberTag
              key={index}
              text={tagText(mark.fields)}
              className={cx('stamp', styles.boxTag, index === focusedLine && styles.inverted, dimmed(index) && styles.dimmed)}
              style={{
                left: corner(frames[index].left),
                top: corner(frames[index].top),
                animationDelay: tagDelay(count),
                animationDuration: 'var(--dur-quick)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

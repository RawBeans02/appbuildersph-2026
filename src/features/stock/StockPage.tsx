import { useEffect, useRef, useState, type RefObject } from 'react'
import { useFlowMode } from '../../app/flow'
import { isReaderLoaded, readBox, warmUpReader, type ReadLine } from '../../inference/ocr/ocrClient'
import { useModelsPrepared } from '../../lib/useModelsPrepared'
import { parseLabel } from '../../rules/label'
import { ReaderFailedScreen, UnreadableScreen } from './ReadFailedScreen'
import { ReadingScreen, type ReadingPhase } from './ReadingScreen'
import { ReviewScreen, type ScanResult } from './ReviewScreen'
import { ScanScreen } from './ScanScreen'
import { StockList } from './StockList'
import { nothingRead } from './stock'

// /stock: the list (12a/12b), and the scan flow over it: the camera (10a),
// reading on this phone (L6a/L6b), the review (11a) or typing it in, and the
// two errors (L9c couldn't read, L9b the reader didn't start). The photo
// lives in memory only and is let go when the flow leaves it; nothing is
// saved without Confirm. The bottom nav hides inside the flow.

type Step =
  | { name: 'list' }
  | { name: 'camera' }
  | { name: 'reading'; phase: ReadingPhase; fraction: number | null }
  | { name: 'review'; scan: ScanResult | null }
  | { name: 'unreadable' }
  | { name: 'reader-failed' }

type Photo = { blob: Blob; url: string }

function abortRead(read: RefObject<AbortController | null>) {
  read.current?.abort()
  read.current = null
}

export default function StockPage() {
  const [step, setStep] = useState<Step>({ name: 'list' })
  const [photo, setPhoto] = useState<Photo | null>(null)
  // The read in progress; a newer read, Cancel or leaving replaces it.
  const current = useRef<AbortController | null>(null)
  const prepared = useModelsPrepared('phone')
  useFlowMode(step.name !== 'list')

  // "The photo is deleted when you leave": its object URL goes with it.
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])
  // Leaving /stock mid-read stops the read.
  useEffect(() => () => abortRead(current), [])

  function stopReading() {
    abortRead(current)
  }

  function go(next: Step) {
    stopReading()
    setPhoto(null)
    setStep(next)
  }

  function onPhoto(blob: Blob) {
    const next = { blob, url: URL.createObjectURL(blob) }
    setPhoto(next)
    void read(next)
  }

  async function read(source: Photo) {
    stopReading()
    const controller = new AbortController()
    current.current = controller
    const live = () => current.current === controller

    const wasLoaded = isReaderLoaded()
    setStep({ name: 'reading', phase: wasLoaded ? 'finding' : 'loading', fraction: null })
    let loadMs: number | null = null
    try {
      const loadStart = performance.now()
      await warmUpReader()
      if (!wasLoaded) loadMs = performance.now() - loadStart
    } catch (error) {
      if (!live()) return
      console.error('The box reader did not start:', error)
      current.current = null
      setStep({ name: 'reader-failed' })
      return
    }
    if (!live()) return

    const start = performance.now()
    let lines: ReadLine[]
    try {
      lines = await readBox(source.blob, {
        signal: controller.signal,
        onProgress: ({ stage, fraction }) => {
          if (live()) setStep({ name: 'reading', phase: stage === 'detect' ? 'finding' : 'reading', fraction })
        },
      })
    } catch (error) {
      if (!live()) return
      console.error('The box was not read:', error)
      current.current = null
      setStep({ name: 'unreadable' })
      return
    }
    if (!live()) return
    current.current = null
    const readMs = performance.now() - start
    const reading = parseLabel(lines)
    setStep(
      nothingRead(reading)
        ? { name: 'unreadable' }
        : {
            name: 'review',
            scan: { reading, lines: lines.map((line) => line.text), frames: lines.map((line) => line.frame), readMs, loadMs },
          },
    )
  }

  const toList = () => go({ name: 'list' })
  const toCamera = () => go({ name: 'camera' })
  const typeIn = () => go({ name: 'review', scan: null })

  switch (step.name) {
    case 'camera':
      return <ScanScreen onClose={toList} onPhoto={onPhoto} onTypeIn={typeIn} />
    case 'reading':
      return <ReadingScreen photoUrl={photo?.url ?? null} phase={step.phase} fraction={step.fraction} onCancel={toCamera} />
    case 'review':
      return (
        <ReviewScreen
          scan={step.scan}
          photoUrl={photo?.url ?? null}
          onBack={toList}
          onScanAgain={toCamera}
          onSaved={toList}
        />
      )
    case 'unreadable':
      return <UnreadableScreen photoUrl={photo?.url ?? null} onBack={toCamera} onScanAgain={toCamera} onTypeIn={typeIn} />
    case 'reader-failed':
      return (
        <ReaderFailedScreen
          prepared={prepared}
          onBack={toCamera}
          onRetry={() => (photo ? void read(photo) : toCamera())}
        />
      )
    default:
      return <StockList onScan={toCamera} onTypeIn={typeIn} />
  }
}

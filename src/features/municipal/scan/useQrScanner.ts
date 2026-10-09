import { useCallback, useEffect, useRef, useState } from 'react'
import { createQrDecoder, decodeImageFile, type DecoderEngine, type QrDecoder } from './decoder'
import { startScanLoop } from './loop'

// The laptop camera, the decode loop and a photo fallback. The camera starts
// only when the officer asks; frames are decoded on this device and never
// stored or sent.

export type ScannerState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'scanning'; engine: DecoderEngine }
  | { status: 'denied' }
  | { status: 'no-camera' }
  // No camera API: an old browser, or a page that isn't HTTPS or localhost.
  | { status: 'unsupported' }
  | { status: 'error'; message: string }

// What a getUserMedia failure means for the officer.
export function cameraErrorState(error: unknown): ScannerState {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return { status: 'denied' }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return { status: 'no-camera' }
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return { status: 'error', message: 'the camera is in use by another app or tab.' }
  }
  return { status: 'error', message: error instanceof Error ? error.message : 'unknown error.' }
}

type Session = { stream: MediaStream; stopLoop: () => void }

function release(session: Session | null) {
  session?.stopLoop()
  session?.stream.getTracks().forEach((track) => track.stop())
}

export function useQrScanner(onText: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<ScannerState>({ status: 'idle' })
  const onTextRef = useRef(onText)
  const session = useRef<Session | null>(null)
  // Bumped by stop(), so a start() still waiting on the camera gives up.
  const attempt = useRef(0)
  const decoder = useRef<Promise<QrDecoder> | null>(null)
  const getDecoder = useCallback(() => (decoder.current ??= createQrDecoder()), [])

  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  const stop = useCallback(() => {
    attempt.current++
    release(session.current)
    session.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState({ status: 'idle' })
  }, [])

  const start = useCallback(async () => {
    if (session.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ status: 'unsupported' })
      return
    }
    const mine = ++attempt.current
    setState({ status: 'starting' })
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
    } catch (error) {
      if (mine === attempt.current) setState(cameraErrorState(error))
      return
    }
    const video = videoRef.current
    if (mine !== attempt.current || !video) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    video.srcObject = stream
    try {
      await video.play()
      const qrDecoder = await getDecoder()
      if (mine !== attempt.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const stopLoop = startScanLoop({
        decodeFrame: async () =>
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0
            ? qrDecoder.decode({ image: video, width: video.videoWidth, height: video.videoHeight })
            : null,
        onText: (text) => onTextRef.current(text),
      })
      session.current = { stream, stopLoop }
      setState({ status: 'scanning', engine: qrDecoder.engine })
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop())
      video.srcObject = null
      if (mine === attempt.current) {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'unknown error.' })
      }
    }
  }, [getDecoder])

  // Turn the camera off when leaving the screen.
  useEffect(
    () => () => {
      attempt.current++
      release(session.current)
      session.current = null
    },
    [],
  )

  const decodeFile = useCallback(async (file: Blob) => decodeImageFile(await getDecoder(), file), [getDecoder])

  return { state, videoRef, start, stop, decodeFile }
}

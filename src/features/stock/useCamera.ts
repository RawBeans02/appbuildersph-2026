import { useEffect, useState, type RefObject } from 'react'

// The back camera, live in a <video>, for the box scan (screen 10a). The
// stream stops when the screen leaves. When there's no camera API, or the
// camera is denied or fails, the state says so and the screen falls back to
// the browser's own photo picker.

export type CameraState =
  | { status: 'starting' }
  | { status: 'live' }
  // denied: the person or the browser said no (rather than no camera at all).
  | { status: 'unavailable'; denied: boolean }

const hasCameraApi = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>): CameraState {
  const [state, setState] = useState<CameraState>(() =>
    hasCameraApi() ? { status: 'starting' } : { status: 'unavailable', denied: false },
  )

  useEffect(() => {
    if (!hasCameraApi()) return
    const video = videoRef.current
    let stream: MediaStream | null = null
    let stopped = false

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then(
        async (granted) => {
          if (stopped) {
            granted.getTracks().forEach((track) => track.stop())
            return
          }
          stream = granted
          if (video) {
            video.srcObject = granted
            // Muted and inline, so it may autoplay; a refused play() still shows frames once tapped.
            await video.play().catch(() => undefined)
          }
          if (!stopped) setState({ status: 'live' })
        },
        (error: unknown) => {
          if (stopped) return
          // Logged for whoever debugs it; the screen shows no codes.
          console.warn('Camera unavailable:', error)
          const name = (error as { name?: string } | null)?.name
          setState({ status: 'unavailable', denied: name === 'NotAllowedError' || name === 'SecurityError' })
        },
      )

    return () => {
      stopped = true
      stream?.getTracks().forEach((track) => track.stop())
      if (video) video.srcObject = null
    }
  }, [videoRef])

  return state
}

// The current frame as a JPEG, at the camera's full resolution.
export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context || !canvas.width || !canvas.height) return Promise.reject(new Error('The camera has no frame yet.'))
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The photo could not be made.'))), 'image/jpeg', 0.95),
  )
}

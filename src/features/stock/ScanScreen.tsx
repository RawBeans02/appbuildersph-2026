import { CameraIcon, CameraSlashIcon, SunIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Button, FlowTopBar } from '../../components'
import styles from './Scan.module.css'
import { captureFrame, useCamera } from './useCamera'

// Screen 10a: the back camera inside the app, with a guide for the lot and
// expiry panel. The shutter takes one frame, which goes to the reader; the
// stream stops when this screen leaves. Without a camera (no API, denied,
// none found), a sheet like Hinga 3d offers the browser's own photo picker
// and typing it in.
// NEEDS DESIGN: the photo-picker fallback ("Scan a medicine box"); it follows 3d for now.
export function ScanScreen({
  onClose,
  onPhoto,
  onTypeIn,
}: {
  onClose: () => void
  onPhoto: (photo: Blob) => void
  onTypeIn: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const camera = useCamera(videoRef)
  const [taking, setTaking] = useState(false)
  const unavailable = camera.status === 'unavailable'

  useEffect(() => {
    headingRef.current?.focus()
  }, [unavailable])

  async function takePhoto() {
    const video = videoRef.current
    if (!video || taking) return
    setTaking(true)
    try {
      onPhoto(await captureFrame(video))
    } catch (error) {
      console.warn('No photo taken:', error)
      setTaking(false)
    }
  }

  return (
    <div className={styles.screen}>
      <FlowTopBar dark backKind="close" backLabel="Close" onBack={onClose} />
      <div className={styles.viewfinder}>
        <video ref={videoRef} className={styles.video} muted playsInline aria-hidden />
        {!unavailable && (
          <div className={styles.guide}>
            <h1 ref={headingRef} tabIndex={-1} className={styles.guideLabel}>
              Fit the lot and expiry inside the box
            </h1>
            <div className={styles.guideBox} aria-hidden />
            <p className={styles.tip}>
              <SunIcon size={18} weight="bold" aria-hidden />
              Glare? Tilt the box away from the light.
            </p>
          </div>
        )}
      </div>

      {unavailable ? (
        <div className={styles.sheet}>
          <div className={styles.grabber} aria-hidden />
          <span className={styles.sheetIcon} aria-hidden>
            <CameraSlashIcon size={30} weight="bold" />
          </span>
          <h1 ref={headingRef} tabIndex={-1} className={styles.sheetTitle}>
            The camera is blocked
          </h1>
          {camera.denied && (
            <p className={styles.sheetBody}>To allow it, open this site's settings in your browser and turn on Camera.</p>
          )}
          <label className={styles.fileButton}>
            <input
              type="file"
              accept="image/*"
              className="visually-hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) onPhoto(file)
              }}
            />
            <CameraIcon size={22} weight="bold" aria-hidden />
            Scan a medicine box
          </label>
          <div className={styles.sheetLink}>
            <Button variant="text" onClick={onTypeIn}>
              Type it in
            </Button>
          </div>
        </div>
      ) : (
        <div className={`${styles.panel} on-night`}>
          <div className={styles.controls}>
            <div className={styles.typeIn}>
              <Button variant="text" onNight onClick={onTypeIn}>
                Type it in
              </Button>
            </div>
            <button
              type="button"
              className={styles.shutter}
              aria-label="Take photo"
              disabled={camera.status !== 'live' || taking}
              onClick={() => void takePhoto()}
            />
            <span />
          </div>
          <p className={styles.note}>Read on this phone. The photo is deleted after.</p>
        </div>
      )}
    </div>
  )
}

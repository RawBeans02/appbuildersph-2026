import { CheckCircleIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { TOAST_MS, ToastContext, type ToastInput } from './toastContext'
import styles from './Toast.module.css'

// Toast: ink, above the nav, 16 px from the edges, for 6 s or until the next
// tap. Never the only place a result is shown.

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { key: number }) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback((next: ToastInput) => {
    clearTimeout(timer.current)
    setToast({ ...next, key: Date.now() })
    timer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  // "Or until the next tap": a tap anywhere but the toast itself closes it, so
  // it never sits over what the next step shows (e.g. the laptop's return QR).
  const box = useRef<HTMLDivElement>(null)
  const open = toast !== null
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && box.current?.contains(event.target)) return
      clearTimeout(timer.current)
      setToast(null)
    }
    document.addEventListener('pointerdown', close, true)
    return () => document.removeEventListener('pointerdown', close, true)
  }, [open])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toast && (
          <div key={toast.key} ref={box} className={`${styles.toast} rise`}>
            <CheckCircleIcon className={styles.icon} size={22} weight="bold" aria-hidden />
            <span className={styles.message}>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  toast.action?.onClick()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

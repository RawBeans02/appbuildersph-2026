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

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toast && (
          <div key={toast.key} className={styles.toast}>
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

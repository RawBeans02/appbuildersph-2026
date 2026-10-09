import { createContext, useContext } from 'react'

export type ToastInput = { message: string; action?: { label: string; onClick: () => void } }

export const ToastContext = createContext<(toast: ToastInput) => void>(() => {})

export const TOAST_MS = 6000

// Shows a toast (ToastProvider must be above).
export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext)
}

import { useCallback, useEffect, useRef, useState } from 'react'

// The Watch screens on one route: 9a the list, 8a log a flood, 8b mark who
// was exposed. Each flow step gets a history entry (/watch?step=log), so the
// phone's back button steps back through the flow. Home can link straight to
// 8a with /watch?step=log.

export type WatchStep = 'list' | 'log' | 'mark'

export function stepFromSearch(search: string): WatchStep {
  const step = new URLSearchParams(search).get('step')
  return step === 'log' || step === 'mark' ? step : 'list'
}

export function stepUrl(step: WatchStep): string {
  return step === 'list' ? '/watch' : `/watch?step=${step}`
}

// How many flow entries this history entry sits above the one the user came
// in on.
function depth(): number {
  const state: unknown = window.history.state
  return typeof state === 'object' && state !== null && 'watchFlow' in state && typeof state.watchFlow === 'number'
    ? state.watchFlow
    : 0
}

export function useWatchSteps() {
  const [step, setStep] = useState<WatchStep>(() => stepFromSearch(window.location.search))
  const returning = useRef(false)

  useEffect(() => {
    const onPop = () => {
      if (returning.current) {
        // Back at the entry the user came in on: it becomes the list.
        returning.current = false
        window.history.replaceState(null, '', stepUrl('list'))
        setStep('list')
        return
      }
      setStep(stepFromSearch(window.location.search))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const show = useCallback((next: WatchStep) => {
    setStep(next)
    window.scrollTo(0, 0)
  }, [])

  // Forward into the flow.
  const go = useCallback(
    (next: WatchStep) => {
      window.history.pushState({ watchFlow: depth() + 1 }, '', stepUrl(next))
      show(next)
    },
    [show],
  )

  // The top bar's back button: the previous entry if the flow made it, else
  // the parent step in place.
  const back = useCallback(
    (parent: WatchStep) => {
      if (depth() > 0) window.history.back()
      else {
        window.history.replaceState(null, '', stepUrl(parent))
        show(parent)
      }
    },
    [show],
  )

  // After Confirm: back to the list, dropping the flow's entries, so the back
  // button doesn't reopen a finished flow.
  const finish = useCallback(() => {
    const steps = depth()
    if (steps > 0) {
      returning.current = true
      window.history.go(-steps)
    } else {
      window.history.replaceState(null, '', stepUrl('list'))
    }
    show('list')
  }, [show])

  return { step, go, back, finish }
}

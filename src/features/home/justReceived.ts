// 1g: after instructions are saved on /receive, "Back to Home" marks Home's
// history entry, so that one visit shows the instructions row as just
// received. Home clears the mark once it has read it, so a reload or coming
// back later shows the row as usual.

const KEY = 'agapaymoJustReceived'

type HistoryState = Record<string, unknown> | null

const state = (): HistoryState => {
  const current: unknown = window.history.state
  return current && typeof current === 'object' ? (current as Record<string, unknown>) : null
}

// Call right after navigate('/'), so the mark lands on Home's new entry.
export function markJustReceived() {
  window.history.replaceState({ ...state(), [KEY]: true }, '')
}

export function readJustReceived(): boolean {
  return state()?.[KEY] === true
}

export function clearJustReceived() {
  const current = state()
  if (!current || !(KEY in current)) return
  const rest = { ...current }
  delete rest[KEY]
  window.history.replaceState(Object.keys(rest).length ? rest : null, '')
}

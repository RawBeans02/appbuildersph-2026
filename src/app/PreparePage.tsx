import { modelBytes, offlineModels } from '../lib/offlineModels'
import type { ModelDownloadState } from '../lib/modelDownload'
import { useModelDownload } from '../lib/useModelDownload'

// "Prepare for offline": downloads every phone model once, so the app works
// with no signal. Plain until design/ lands. NEEDS DESIGN.

const phoneModels = offlineModels.filter((model) => model.device === 'phone')
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`

function Status({ state }: { state: ModelDownloadState }) {
  switch (state.status) {
    case 'idle':
      return null
    case 'checking-storage':
      return <p>Checking storage on this phone…</p>
    case 'downloading': {
      const percent = state.totalBytes ? Math.floor((state.loadedBytes / state.totalBytes) * 100) : 100
      return (
        <p>
          Downloading: {mb(state.loadedBytes)} of {mb(state.totalBytes)} ({percent}%)
          <br />
          <progress max={state.totalBytes} value={state.loadedBytes} aria-label="Download progress" />
        </p>
      )
    }
    case 'verifying':
      return <p>Checking the files…</p>
    case 'ready':
      return <p>Ready. The AI now works on this phone with no signal.</p>
    case 'error':
      return (
        <p role="alert">
          {state.code === 'insufficient-storage' && state.storage?.availableBytes != null
            ? `Not enough storage: needs ${mb(state.storage.requiredBytes)}, ${mb(state.storage.availableBytes)} free.`
            : state.code === 'network'
              ? 'The download stopped. Connect to the internet and try again.'
              : `The download failed (${state.code}): ${state.message}`}
        </p>
      )
  }
}

export default function PreparePage() {
  const { state, start, cancel, retry } = useModelDownload(phoneModels)
  return (
    <section data-prepare-status={state.status}>
      <h1>Prepare for offline</h1>
      <p>
        Downloads the on-device AI once ({mb(modelBytes(phoneModels))}). After that, Agapay works with no signal, and
        nothing you record leaves this phone.
      </p>
      <ul>
        {phoneModels.map((model) => (
          <li key={`${model.id}@${model.version}`}>
            {model.label}: {mb(modelBytes([model]))}
          </li>
        ))}
      </ul>
      <Status state={state} />
      {state.status === 'idle' && (
        <button type="button" onClick={() => void start()}>
          Prepare for offline
        </button>
      )}
      {state.status === 'downloading' && (
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      )}
      {state.status === 'error' && (
        <button type="button" onClick={() => void retry()}>
          Try again
        </button>
      )}
    </section>
  )
}

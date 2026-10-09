import { useState } from 'react'
import { getDb } from '../../data/db/appDb'
import { generateSeed } from '../../data/seed/generate'
import { loadMunicipalSample } from '../municipal/municipal'
import { resetSampleData } from './resetSampleData'

// Rehearsal and Demo Day tools, on /device only. Plain on purpose.

export function DemoTools() {
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reset(resetPairing: boolean) {
    const question = resetPairing
      ? "Reset every record to the sample data dated today, and forget this phone's key and all paired phones? Downloaded models are kept."
      : 'Reset every record to the sample data dated today? Downloaded models and pairing are kept.'
    if (!window.confirm(question)) return
    setBusy(true)
    setStatus('Resetting…')
    try {
      await resetSampleData(await getDb(), {
        resetPairing,
        makeSeed: () => generateSeed(new Date()),
        loadMunicipalSample: (db) => loadMunicipalSample(db),
      })
      setStatus(resetPairing ? 'Sample data and pairing reset.' : "Sample data reset to today's dates.")
    } catch (error) {
      setStatus(`The reset failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="demo-tools">
      <h2 id="demo-tools">Demo tools</h2>
      <p>For rehearsals and Demo Day. The downloaded AI models and the offline app stay on this device.</p>
      <p>
        <button type="button" disabled={busy} onClick={() => void reset(false)}>
          Reset sample data
        </button>{' '}
        <button type="button" disabled={busy} onClick={() => void reset(true)}>
          Reset sample data and pairing
        </button>
      </p>
      {status && <p role="status">{status}</p>}
    </section>
  )
}

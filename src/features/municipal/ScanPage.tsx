import { useCallback, useState } from 'react'
import { Link } from '../../app/Link'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery } from '../../data/db/useDbQuery'
import { barangayName, DEMO_BARANGAYS } from '../../data/places'
import { compareExports, describeOutcome, type ScanOutcome } from './scan/classify'
import { QrScanner } from './scan/QrScanner'
import { ensureMunicipalSample, pairDevice, readHandoff, receiveScan } from './municipal'

// Screens 16–17: receive the barangays' QR codes (and pair a phone) on the
// municipal laptop. Plain until design/ lands. NEEDS DESIGN: screens 16–17.

const readScanScreen = async (db: AgapayDb) => {
  await ensureMunicipalSample(db)
  return readHandoff(db)
}

const nameOf = (code: string) => barangayName(code) ?? code

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function ScanPage() {
  const data = useDbQuery(['pairedDevices', 'receivedPayloads'], readScanScreen)
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [paired, setPaired] = useState<string | null>(null)

  const onText = useCallback(async (text: string) => {
    setProblem(null)
    setPaired(null)
    try {
      setOutcome(await receiveScan(await getDb(), text))
    } catch {
      setProblem('Could not save to this laptop’s storage. Try again.')
    }
  }, [])

  async function confirmPairing(pairing: Extract<ScanOutcome, { kind: 'pair' }>) {
    try {
      await pairDevice(await getDb(), pairing)
      setPaired(pairing.pairing.barangay)
      setOutcome(null)
    } catch {
      setProblem('Could not save the pairing. Try again.')
    }
  }

  return (
    <>
      <h1>Receive barangay QR codes</h1>
      <p>
        Each barangay phone shows a QR code with de-identified counts: no names, small numbers as "&lt;5". This laptop
        checks each QR against the key of the phone paired for that barangay. Nothing is sent anywhere.
      </p>

      <QrScanner onText={(text) => void onText(text)} />

      <section aria-labelledby="result-heading" aria-live="polite">
        <h2 id="result-heading">Last scan</h2>
        {problem && <p role="alert">{problem}</p>}
        {paired && <p>Paired {nameOf(paired)}. Now scan the counts QR on its Send screen.</p>}
        {!outcome && !problem && !paired && <p>Nothing scanned yet.</p>}
        {outcome && <p>{describeOutcome(outcome)}</p>}
        {outcome?.kind === 'pair' && (
          <div>
            <p>
              Fingerprint on this laptop: <strong>{outcome.fingerprint}</strong>
            </p>
            <p>The phone shows its fingerprint under the pairing QR. Pair only if every character matches.</p>
            {outcome.current && (
              <p>
                This replaces the phone paired on {formatTime(outcome.current.pairedAt)} (fingerprint{' '}
                {outcome.current.fingerprint}
                {outcome.current.source === 'seed' ? ', sample data' : ''}). QR codes from that phone will be removed.
              </p>
            )}
            <button type="button" onClick={() => void confirmPairing(outcome)}>
              They match: pair {nameOf(outcome.pairing.barangay)}
            </button>{' '}
            <button type="button" onClick={() => setOutcome(null)}>
              Cancel
            </button>
          </div>
        )}
      </section>

      <section aria-labelledby="slots-heading">
        <h2 id="slots-heading">Barangays</h2>
        {data.status === 'loading' && <p>Loading…</p>}
        {data.status === 'error' && <p role="alert">Could not read this laptop’s records.</p>}
        {data.status === 'ready' && <Slots devices={data.data.devices} received={data.data.received} />}
        <p>
          <Link to="/municipal/plan">Merged table and plan</Link> · <Link to="/municipal/log">Approval log</Link>
        </p>
      </section>
    </>
  )
}

function Slots({ devices, received }: Awaited<ReturnType<typeof readHandoff>>) {
  const known = DEMO_BARANGAYS.map((place) => place.code)
  const extra = [...new Set([...devices, ...received].map((item) => item.barangay))].filter((code) => !known.includes(code))
  const codes = [...known, ...extra.sort()]
  const count = codes.filter((code) => received.some((item) => item.barangay === code)).length
  return (
    <>
      <p>
        {count} of {codes.length} received.
      </p>
      <ol>
        {codes.map((code) => {
          const device = devices.find((item) => item.barangay === code)
          const latest = received
            .filter((item) => item.barangay === code)
            .reduce<(typeof received)[number] | null>((a, b) => (!a || compareExports(b, a) > 0 ? b : a), null)
          const name = nameOf(code)
          return (
            <li key={code}>
              <strong>{name}</strong> ({code}){device?.source === 'seed' ? ' · Sample data' : ''}
              <br />
              {device
                ? `Phone paired, fingerprint ${device.fingerprint}.`
                : 'No phone paired yet: scan its pairing QR first.'}{' '}
              {latest
                ? `Received export ${latest.seq}, week ${latest.epiWeek}, at ${formatTime(latest.receivedAt)}.`
                : 'Waiting for its QR.'}
            </li>
          )
        })}
      </ol>
    </>
  )
}

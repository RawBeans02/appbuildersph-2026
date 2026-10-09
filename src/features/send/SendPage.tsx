import { useState } from 'react'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery } from '../../data/db/useDbQuery'
import { AGE_BANDS, formatCount, HINGA_AGE_BANDS, suppress, type AgeBand, type QrPayloadV1 } from '../../qr'
import { localToday } from '../../rules/dates'
import { collectRawCounts } from './counts'
import { createExport, createPairingQr, readPhoneRecords, type PairingQr } from './exportQr'
import { resolvePlace } from './identity'
import { QrImage } from './QrImage'

// Screen 14: what leaves this phone, then the signed QR for the municipal
// laptop. Plain until design/ lands. NEEDS DESIGN: screen 14.

const readSendData = async (db: AgapayDb) => {
  const [records, seed, identity] = await Promise.all([readPhoneRecords(db), db.getSeedInfo(), db.getDeviceIdentity()])
  return { records, seed, fingerprint: identity?.fingerprint ?? null }
}

const BAND_LABELS: Record<AgeBand, string> = {
  under2m: 'under 2 months',
  m2to12: '2 to 11 months',
  y1to5: '1 to 4 years',
  y5to17: '5 to 17 years',
  y18to59: '18 to 59 years',
  y60plus: '60 and over',
}

export default function SendPage() {
  const data = useDbQuery(
    ['residents', 'exposures', 'hingaChecks', 'stockLots', 'flags', 'deviceIdentity'],
    readSendData,
  )
  const [today] = useState(localToday)
  const [sent, setSent] = useState<{ payload: QrPayloadV1; text: string; fingerprint: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pairing, setPairing] = useState<Extract<PairingQr, { ok: true }> | null>(null)

  if (data.status === 'loading') return <p>Loading…</p>
  if (data.status === 'error') return <p role="alert">Could not read the records on this phone.</p>

  const place = resolvePlace(data.data.seed)
  const raw = collectRawCounts(data.data.records, today)
  const rows: [string, number][] = [
    ...AGE_BANDS.map((band): [string, number] => [`Exposed to floodwater, ${BAND_LABELS[band]}`, raw.exposed[band]]),
    ['In the leptospirosis watch window now', raw.inWatchWindow],
    ...HINGA_AGE_BANDS.map((band): [string, number] => [`Fast breathing referrals, ${BAND_LABELS[band]}`, raw.fastBreathing[band]]),
    ['Urgent referrals (danger signs)', raw.urgentReferrals],
    ['Doxycycline capsules on hand', raw.doxyCapsulesOnHand],
    ['Of those, expiring within 6 weeks', raw.doxyCapsulesExpiring6w],
    ['Flags for clinician review', raw.clinicianReviewFlags],
  ]

  async function onCreate() {
    setError(null)
    try {
      const result = await createExport(await getDb(), today)
      if (result.ok) setSent(result)
      else setError(result.reason)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function onPair() {
    setError(null)
    try {
      const result = await createPairingQr(await getDb())
      if (result.ok) setPairing(result)
      else setError(result.reason)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <>
      <h1>Send to the RHU</h1>
      {!place.ok ? (
        <p role="alert">This phone can't send yet: {place.reason}</p>
      ) : (
        <>
          <h2>What leaves this phone</h2>
          <p>Counts only, for this week. Numbers from 1 to 4 are shown as "&lt;5" so no one can be picked out.</p>
          <table>
            <tbody>
              <tr>
                <th scope="row">Municipality, barangay</th>
                <td>
                  {place.municipality}, {place.barangay}
                </td>
              </tr>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{formatCount(suppress(value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>What never leaves this phone</h2>
          <p>
            Names, birth dates, households and puroks, exact dates, photos of medicine boxes, and anything from the
            camera or microphone.
          </p>
          {sent ? (
            <>
              <QrImage text={sent.text} label={`QR code with this week's counts for ${sent.payload.barangay}`} />
              <p>
                Export {sent.payload.seq}, week {sent.payload.epiWeek}. Show this to the municipal health officer's
                laptop.
              </p>
              <p>This phone's key: {sent.fingerprint}. The laptop shows the same code when it trusts this phone.</p>
              <button type="button" onClick={() => void onCreate()}>
                Make a new QR
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void onCreate()}>
              Create the QR
            </button>
          )}
          {data.data.fingerprint && !sent && <p>This phone's key: {data.data.fingerprint}</p>}

          <h2>Pair with the RHU laptop (once)</h2>
          {pairing ? (
            <>
              <QrImage text={pairing.text} label={`Pairing QR for ${pairing.barangay}`} />
              <p>
                The laptop must show this code: <strong>{pairing.fingerprint}</strong>. Pair only if it matches.
              </p>
              <button type="button" onClick={() => setPairing(null)}>
                Done
              </button>
            </>
          ) : (
            <>
              <p>The laptop needs this phone's public key once, before it can trust this phone's QR codes.</p>
              <button type="button" onClick={() => void onPair()}>
                Show the pairing QR
              </button>
            </>
          )}
        </>
      )}
      {error && <p role="alert">Could not create the QR: {error}</p>}
    </>
  )
}

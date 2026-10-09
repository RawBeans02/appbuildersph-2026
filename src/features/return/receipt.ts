import type { AgapayDb } from '../../data/db/db'
import { decodeReturn, type VerifiedReturn } from '../../qr/return'
import { resolvePlace } from '../send/identity'

export async function previewReceipt(db: AgapayDb, text: string) {
  const place = resolvePlace(await db.getSeedInfo())
  if (!place.ok) throw new Error(place.reason)
  const verified = await decodeReturn(text, place.municipality, place.barangay)
  const trust = (await db.getMunicipalTrust()).find((key) => key.municipality === place.municipality)
  if (trust && (trust.publicJwk.x !== verified.packet.publicJwk.x || trust.publicJwk.y !== verified.packet.publicJwk.y)) throw new Error('The municipal key changed. Reset pairing and compare the new fingerprint with the RHU laptop.')
  return { ...verified, needsTrust: !trust }
}

export async function saveReceipt(db: AgapayDb, preview: VerifiedReturn, compared: boolean, now = new Date()) {
  // Re-verify and re-read the place/trust at the explicit Save action.
  const verified = await previewReceipt(db, preview.text)
  return db.saveReceivedInstructions({ packet: verified.packet, fingerprint: verified.fingerprint, text: verified.text, receivedAt: now.toISOString() }, compared)
}

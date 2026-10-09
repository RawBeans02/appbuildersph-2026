import type { ReturnPacket } from '../../qr/return'
import type { PublicJwk } from '../../qr/sign'

export type TrustedMunicipalKey = {
  municipality: string
  publicJwk: PublicJwk
  fingerprint: string
  trustedAt: string
}

export type ReceivedInstructions = {
  packet: ReturnPacket
  fingerprint: string
  text: string
  receivedAt: string
}

export const MUNICIPAL_TRUST_META = 'trustedMunicipalKeys'
export const INSTRUCTIONS_META = 'receivedInstructions'

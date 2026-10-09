import { describe, expect, it } from 'vitest'
import type { VerifiedReturn } from '../../qr/return'
import { receiveChecks, receiveChecksSpoken, receiveError } from './receiveCopy'

const verified = {
  packet: { barangay: 'SID-MAL', epiWeek: '2026-W41' },
  fingerprint: '5E21-9A0C-77B4-D31F',
} as VerifiedReturn

describe('21a receive copy', () => {
  it('lists the checks in the order they ran, with the key and the place by name', () => {
    expect(receiveChecks(verified)).toEqual([
      { status: 'ok', text: 'Read the QR' },
      { status: 'ok', text: 'Signed by the RHU laptop', detail: 'Key 5E21-9A0C-77B4-D31F' },
      { status: 'ok', text: 'For Maligaya-D, week 2026-W41' },
    ])
    expect(receiveChecksSpoken(verified)).toBe('Read the QR. Signed by the RHU laptop. For Maligaya-D, week 2026-W41.')
  })

  it('gives every error one next step, and keeps the ones that already have it', () => {
    expect(receiveError('This return QR version is unsupported.', 'Maligaya-D')).toBe(
      'This return QR version is unsupported. Ask the RHU to make a new return QR.',
    )
    expect(receiveError('These instructions are for another barangay. Nothing was saved.', 'Maligaya-D')).toBe(
      'These instructions are for another barangay. Nothing was saved. Ask the RHU for the QR made for Maligaya-D.',
    )
    expect(receiveError('This approval is older than, or conflicts with, the saved instructions. Nothing was saved.', null)).toMatch(
      /older .* Nothing was saved\. Ask the RHU for the return QR of the newest approval\.$/,
    )
    const changed = 'The municipal key changed. Reset pairing and compare the new fingerprint with the RHU laptop.'
    expect(receiveError(changed, 'Maligaya-D')).toBe(changed)
  })
})

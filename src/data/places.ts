// The fictional demo places and their QR codes (see src/qr/schema.ts for the
// code patterns). Every name here is invented for the demo.

export type DemoPlace = { name: string; code: string }

export const DEMO_MUNICIPALITY: DemoPlace = { name: 'San Isidro Demo', code: 'SID' }

// The live demo phone is Maligaya-D; the other four arrive as pre-made QRs.
export const DEMO_BARANGAYS: readonly DemoPlace[] = [
  { name: 'Maligaya-D', code: 'SID-MAL' },
  { name: 'Bagong Silang-D', code: 'SID-BGS' },
  { name: 'Santo Niño-D', code: 'SID-STN' },
  { name: 'Mabini-D', code: 'SID-MAB' },
  { name: 'Riverside-D', code: 'SID-RIV' },
]

export function barangayCode(name: string): string | null {
  return DEMO_BARANGAYS.find((place) => place.name === name)?.code ?? null
}

export function barangayName(code: string): string | null {
  return DEMO_BARANGAYS.find((place) => place.code === code)?.name ?? null
}

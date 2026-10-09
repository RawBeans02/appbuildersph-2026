import jsQR from 'jsqr'

// The pure-JavaScript QR decoder for browsers without BarcodeDetector
// (Firefox, Safari, Chrome on Windows and Linux). Bundled with the app, so it
// works offline. Loaded only when needed (decoder.ts imports this lazily).
//
// `invert`: also try light-on-dark codes. Slower, so the camera loop leaves it
// off (the Send screen draws black on white) and a photo turns it on.
export function decodeRgba(data: Uint8ClampedArray, width: number, height: number, invert = false): string | null {
  const found = jsQR(data, width, height, { inversionAttempts: invert ? 'attemptBoth' : 'dontInvert' })
  return found?.data || null
}

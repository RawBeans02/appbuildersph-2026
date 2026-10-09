import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

// Draws QR text as an SVG: crisp at any size, black on white with the
// standard 4-module quiet zone, so any phone or laptop camera can scan it.
// data-qr-text holds the same text for the camera-less e2e test
// (e2e/demo-handoff.spec.ts); it is the QR's content, nothing more.
export function QrImage({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text, 'Byte')
    qr.make()
    const count = qr.getModuleCount()
    const margin = 4
    let d = ''
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col + margin} ${row + margin}h1v1h-1z`
      }
    }
    return { size: count + margin * 2, path: d }
  }, [text])

  return (
    <svg
      role="img"
      aria-label={label}
      data-qr-text={text}
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: 360 }}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

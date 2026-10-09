// I1, the brand tile (design pass 2): the app icon at any size, inline so
// nothing new is precached. Stand-in until Claude Design's brand-tile.svg
// lands: the "a" is set in the app's font instead of an outlined path.
export function BrandTile({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
      style={{ flex: 'none' }}
    >
      <rect width="48" height="48" rx="10" fill="var(--ink)" />
      <text
        x="21"
        y="35"
        textAnchor="middle"
        fill="var(--paper)"
        style={{ font: '800 34px var(--font-ui)' }}
      >
        a
      </text>
      <circle cx="35.5" cy="33" r="3.5" fill="var(--warn-fill)" />
    </svg>
  )
}

// I3 "After the flood" (design pass 2, design/svg/intro-barangay.svg without
// its metadata): two houses (one on stilts), the barangay health station with
// its amber lamp lit, the waterline, and a cell tower with no signal. Calm,
// never moves, aria-hidden; the card's h1 says what it means.
export function IntroArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 335 160"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="var(--ink)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M0 118H335V160H0Z" fill="var(--sunken)" stroke="none" />
      <path d="M30 96V146M48 96V146M66 96V146M84 96V146" />
      <path d="M0 118H335" />
      <rect x="26" y="62" width="62" height="34" fill="var(--surface)" />
      <path d="M18 64L57 34L96 64Z" fill="var(--paper)" />
      <rect x="36" y="72" width="14" height="12" rx="1" />
      <path d="M62 96V74H76V96" />
      <path d="M124 60V50H224V60Z" fill="var(--sunken)" />
      <rect x="128" y="60" width="92" height="58" fill="var(--surface)" />
      <rect x="140" y="74" width="28" height="24" rx="2" />
      <path d="M154 74V80" />
      <circle cx="154" cy="85" r="4.5" fill="var(--warn-fill)" />
      <path d="M186 118V82H208V118" />
      <rect x="240" y="84" width="44" height="34" fill="var(--surface)" />
      <path d="M234 86L262 64L290 86Z" fill="var(--paper)" />
      <rect x="255" y="94" width="14" height="12" rx="1" />
      <path d="M304 118L314 30L324 118M307 92H321M309 70H319M307 92L319 70M309 70L317 50M311 50H317M314 30V22" />
      <path d="M320 16a9 9 0 0 1 0 12M325 11a16 16 0 0 1 0 22" />
      <path d="M317 9L331 33" />
      <path d="M98 132L146 125M112 130L117 122M130 127L137 133" />
      <path d="M8 134H22M152 136H168M196 131H212M226 143H244M262 133H278M22 151H38M176 149H192M292 151H306" />
    </svg>
  )
}

import type { PlannedRoute } from './routes'

// Shown for a planned screen that no feature has claimed yet.
export function PlaceholderPage({ route }: { route: PlannedRoute }) {
  return (
    <>
      <h1>{route.title}</h1>
      <p>This screen is not built yet.</p>
    </>
  )
}

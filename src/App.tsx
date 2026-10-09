import { lazy, Suspense, useEffect, type ReactElement } from 'react'
import { featureRoutes } from './app/featureRoutes'
import { Layout } from './app/Layout'
import { NotFoundPage } from './app/NotFoundPage'
import { PlaceholderPage } from './app/PlaceholderPage'
import { usePath } from './app/router'
import { resolveRoute } from './app/routes'
import { ToastProvider } from './components'
import type { AgapayDb } from './data/db/db'
import { useDbQuery } from './data/db/useDbQuery'

// Each route's page element is made once, from a lazy component, so every
// screen is its own chunk and React keeps its state across renders.
const pages = new Map<string, ReactElement>(
  [...featureRoutes.values()].map((route) => {
    const Page = lazy(route.load)
    return [
      route.path,
      <Suspense key={route.path} fallback={<p>Loading…</p>}>
        <Page />
      </Suspense>,
    ]
  }),
)

const readSeedInfo = (db: AgapayDb) => db.getSeedInfo()

// NEEDS DESIGN: the "Sample data" label.
function SampleDataNotice() {
  const seed = useDbQuery(['residents'], readSeedInfo)
  if (seed.status !== 'ready' || !seed.data) return null
  return (
    <p>
      Sample data: {seed.data.barangay}, {seed.data.municipality}. Invented records for the demo.
    </p>
  )
}

export default function App() {
  const path = usePath()
  const resolved = resolveRoute(path, featureRoutes)
  const title = resolved.kind === 'not-found' ? 'Page not found' : resolved.route.title

  useEffect(() => {
    document.title = title === 'Agapay' ? 'Agapay' : `${title} · Agapay`
  }, [title])

  return (
    <ToastProvider>
      <Layout path={path} notice={<SampleDataNotice />}>
        {resolved.kind === 'feature' ? (
          pages.get(resolved.route.path)
        ) : resolved.kind === 'planned' ? (
          <PlaceholderPage route={resolved.route} />
        ) : (
          <NotFoundPage />
        )}
      </Layout>
    </ToastProvider>
  )
}

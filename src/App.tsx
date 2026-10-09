import { lazy, Suspense, useEffect, type ReactElement } from 'react'
import { featureRoutes } from './app/featureRoutes'
import { Layout } from './app/Layout'
import { NotFoundPage } from './app/NotFoundPage'
import { PlaceholderPage } from './app/PlaceholderPage'
import { usePath } from './app/router'
import { resolveRoute } from './app/routes'
import { ToastProvider } from './components'

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

export default function App() {
  const path = usePath()
  const resolved = resolveRoute(path, featureRoutes)
  const title = resolved.kind === 'not-found' ? 'Page not found' : resolved.route.title

  useEffect(() => {
    document.title = title === 'Agapay' ? 'Agapay' : `${title} · Agapay`
  }, [title])

  return (
    <ToastProvider>
      <Layout path={path}>
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

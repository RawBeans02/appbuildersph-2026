import { lazy, Suspense, useEffect, type ReactElement } from 'react'
import { featureRoutes } from './app/featureRoutes'
import { Layout } from './app/Layout'
import { PlaceholderPage } from './app/PlaceholderPage'
import { usePath } from './app/router'
import { resolveRoute } from './app/routes'
// Straight from the file, not the components barrel: the barrel would pull
// every shared component into the first-load chunk.
import { RouteLoading } from './components/RouteLoading'
import { ToastProvider } from './components/Toast'
import { isLockedPath, useLock } from './features/lock/useLock'

// Each route's page element is made once, from a lazy component, so every
// screen is its own chunk and React keeps its state across renders.
const pages = new Map<string, ReactElement>(
  [...featureRoutes.values()].map((route) => {
    const Page = lazy(route.load)
    return [
      route.path,
      <Suspense key={route.path} fallback={<RouteLoading />}>
        <Page />
      </Suspense>,
    ]
  }),
)

// Phase 2's PIN screens, in place of every phone screen until it's unlocked.
const LockScreens = lazy(() => import('./features/lock/LockScreens'))
const lockScreens = (
  <Suspense fallback={null}>
    <LockScreens />
  </Suspense>
)

// The 404 is its own chunk too: only a wrong address needs it.
const NotFound = lazy(() => import('./app/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const notFoundPage = (
  <Suspense fallback={<RouteLoading />}>
    <NotFound />
  </Suspense>
)

export default function App() {
  const path = usePath()
  const lockView = useLock()
  const gated = lockView.status !== 'off' && lockView.status !== 'unlocked' && isLockedPath(path)
  const resolved = resolveRoute(path, featureRoutes)
  const title = resolved.kind === 'not-found' ? 'Page not found' : resolved.route.title

  useEffect(() => {
    document.title = title === 'AgapayMo' ? 'AgapayMo' : `${title} · AgapayMo`
  }, [title])

  return (
    <ToastProvider>
      <Layout path={path}>
        {gated ? (
          lockScreens
        ) : resolved.kind === 'feature' ? (
          pages.get(resolved.route.path)
        ) : resolved.kind === 'planned' ? (
          <PlaceholderPage route={resolved.route} />
        ) : (
          notFoundPage
        )}
      </Layout>
    </ToastProvider>
  )
}

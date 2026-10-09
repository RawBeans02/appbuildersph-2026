import { coreRoutes } from './coreRoutes'
import { collectFeatureRoutes, type AppRoute } from './routes'

// Kept apart from routes.ts so its tests don't need the real feature folders.
export const featureRoutes = collectFeatureRoutes({
  ...import.meta.glob<{ routes?: AppRoute[] }>('../features/*/routes.ts', { eager: true }),
  'src/app/coreRoutes.ts': { routes: coreRoutes },
})

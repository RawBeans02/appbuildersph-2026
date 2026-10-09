import { describe, expect, it } from 'vitest'
import { collectFeatureRoutes, PLANNED_ROUTES, resolveRoute, type AppRoute } from './routes'

const page = async () => ({ default: () => null })
const route = (path: string, title = path): AppRoute => ({ path, title, load: page })

describe('collectFeatureRoutes', () => {
  it('gathers every feature route by its normalized path', () => {
    const routes = collectFeatureRoutes({
      '../features/hinga/routes.ts': { routes: [route('/hinga/')] },
      '../features/stock/routes.ts': { routes: [route('/stock'), route('/stock/scan')] },
      '../features/empty/routes.ts': {},
    })
    expect([...routes.keys()]).toEqual(['/hinga', '/stock', '/stock/scan'])
  })

  it('refuses two features claiming the same path', () => {
    expect(() =>
      collectFeatureRoutes({
        '../features/a/routes.ts': { routes: [route('/watch')] },
        '../features/b/routes.ts': { routes: [route('/watch/')] },
      }),
    ).toThrow(/Two features claim \/watch/)
  })
})

describe('resolveRoute', () => {
  const features = collectFeatureRoutes({ '../features/hinga/routes.ts': { routes: [route('/hinga', 'Hinga')] } })

  it('prefers a feature, then a planned placeholder, then not found', () => {
    expect(resolveRoute('/hinga/', features)).toMatchObject({ kind: 'feature', route: { title: 'Hinga' } })
    expect(resolveRoute('/municipal/plan', features)).toMatchObject({ kind: 'planned' })
    expect(resolveRoute('/nowhere', features)).toEqual({ kind: 'not-found' })
  })

  it('plans every screen named in TASKS.md A1', () => {
    expect(PLANNED_ROUTES.map((r) => r.path)).toEqual(
      expect.arrayContaining(['/', '/hinga', '/watch', '/stock', '/send', '/privacy', '/municipal', '/municipal/plan', '/municipal/log']),
    )
  })
})

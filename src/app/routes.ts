import type { ComponentType } from 'react'
import { normalizePath } from './router'

// Every screen's path. A feature claims its paths by adding
// src/features/<feature>/routes.ts that exports `routes: AppRoute[]`; the app
// picks those files up on its own (import.meta.glob), so features never edit
// this file. Paths no feature has claimed yet show a placeholder.

export type AppRoute = {
  path: string
  title: string
  // Loaded on first visit, so each screen is its own chunk.
  load: () => Promise<{ default: ComponentType }>
}

export type PlannedRoute = { path: string; title: string; device: 'phone' | 'laptop' | 'dev' }

export const PLANNED_ROUTES: PlannedRoute[] = [
  { path: '/', title: 'Agapay', device: 'phone' },
  { path: '/prepare', title: 'Prepare for offline', device: 'phone' },
  { path: '/hinga', title: 'Hinga breathing check', device: 'phone' },
  { path: '/watch', title: 'Flood exposure watch', device: 'phone' },
  { path: '/stock', title: 'Medicine stock', device: 'phone' },
  { path: '/send', title: 'Send to the RHU', device: 'phone' },
  { path: '/privacy', title: 'Privacy & AI', device: 'phone' },
  { path: '/municipal', title: 'Municipal: scan barangay QRs', device: 'laptop' },
  { path: '/municipal/plan', title: 'Municipal plan', device: 'laptop' },
  { path: '/municipal/log', title: 'Approval log', device: 'laptop' },
  { path: '/device', title: 'Device check', device: 'dev' },
]

export type ResolvedRoute =
  | { kind: 'feature'; route: AppRoute }
  | { kind: 'planned'; route: PlannedRoute }
  | { kind: 'not-found' }

export function collectFeatureRoutes(modules: Record<string, { routes?: AppRoute[] }>): Map<string, AppRoute> {
  const byPath = new Map<string, AppRoute>()
  for (const [file, module] of Object.entries(modules)) {
    for (const route of module.routes ?? []) {
      const path = normalizePath(route.path)
      if (byPath.has(path)) throw new Error(`Two features claim ${path} (the second is in ${file}).`)
      byPath.set(path, { ...route, path })
    }
  }
  return byPath
}

export function resolveRoute(path: string, features: Map<string, AppRoute>): ResolvedRoute {
  const normalized = normalizePath(path)
  const feature = features.get(normalized)
  if (feature) return { kind: 'feature', route: feature }
  const planned = PLANNED_ROUTES.find((route) => route.path === normalized)
  return planned ? { kind: 'planned', route: planned } : { kind: 'not-found' }
}

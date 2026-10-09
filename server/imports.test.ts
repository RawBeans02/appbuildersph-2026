import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Vercel compiles api/*.ts and every file they import to plain ES modules for
// Node, which needs the full file name in a relative import (Vite and Vitest
// don't). An import without ".js" would pass every other check here and only
// fail on the live server, so this test follows the real import graph from
// each route and checks every relative import on the way.

const root = fileURLToPath(new URL('..', import.meta.url))
const RELATIVE = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g

type Graph = { files: string[]; problems: string[] }

function trace(entries: string[]): Graph {
  const seen = new Set<string>()
  const problems: string[] = []
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(join(root, file), 'utf8')
    for (const match of source.matchAll(RELATIVE)) {
      const specifier = match[1] ?? match[2]
      if (!specifier.endsWith('.js')) {
        problems.push(`${file}: ${specifier} (no .js)`)
        continue
      }
      const target = relative(root, join(dirname(join(root, file)), specifier.replace(/\.js$/, '.ts'))).replaceAll('\\', '/')
      if (!existsSync(join(root, target))) problems.push(`${file}: ${specifier} (no ${target})`)
      else queue.push(target)
    }
  }
  return { files: [...seen].sort(), problems }
}

const routes = readdirSync(join(root, 'api'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => `api/${name}`)

describe('the import graph the deployed functions load', () => {
  const graph = trace(routes)

  it('starts from every route and reaches the shared code', () => {
    expect(routes).toEqual(expect.arrayContaining(['api/enroll.ts', 'api/sync.ts', 'api/reports.ts', 'api/health.ts']))
    expect(graph.files).toEqual(expect.arrayContaining(['server/handlers.ts', 'src/qr/codec.ts']))
  })

  it('ends every relative import in .js, pointing at a file that exists', () => {
    expect(graph.problems).toEqual([])
  })

  it('never loads the browser app: no React, IndexedDB, CSS or Vite-only code', () => {
    const offending = graph.files.filter((file) => {
      const text = readFileSync(join(root, file), 'utf8')
      return /from ['"](?:react|react-dom|idb)['"]|\.css['"]|import\.meta\.(?:env|glob)/.test(text) || file.endsWith('.tsx')
    })
    expect(offending).toEqual([])
  })
})

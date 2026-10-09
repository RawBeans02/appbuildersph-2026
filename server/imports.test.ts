import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Vercel compiles api/*.ts and every file they import to plain ES modules for
// Node, which needs the full file name in a relative import (Vite and Vitest
// don't). An import without ".js" would pass every check here and only fail
// on the live server, so this test looks for one.

const root = fileURLToPath(new URL('..', import.meta.url))

function sources(dir: string, recursive: boolean): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return recursive && entry.name !== 'test' && entry.name !== 'integration' ? sources(path, true) : []
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

const RELATIVE = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g

describe('imports the deployed functions reach', () => {
  const files = [...sources('api', false), ...sources('server', true), ...sources('src/qr', false)].filter(
    (file) => !file.endsWith('testFixtures.ts'),
  )

  it('finds the files', () => {
    expect(files).toEqual(expect.arrayContaining(['server/handlers.ts', 'src/qr/codec.ts']))
  })

  it('end every relative import in .js', () => {
    const missing = files.flatMap((file) =>
      [...readFileSync(join(root, file), 'utf8').matchAll(RELATIVE)]
        .map((match) => match[1])
        .filter((specifier) => !specifier.endsWith('.js'))
        .map((specifier) => `${file}: ${specifier}`),
    )
    expect(missing).toEqual([])
  })

  it('never import the browser app or React', () => {
    const offending = files.filter((file) => {
      const text = readFileSync(join(root, file), 'utf8')
      return /from ['"](?:react|idb)['"]|\/src\/(?:features|data|app|components)\//.test(text)
    })
    expect(offending).toEqual([])
  })
})

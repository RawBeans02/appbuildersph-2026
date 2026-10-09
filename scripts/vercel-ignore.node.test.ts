import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// scripts/vercel-ignore.sh, run in a throwaway git repo: exit 0 = Vercel
// skips the build, 1 = it builds.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'vercel-ignore.sh')
function findShell(): string {
  if (process.platform !== 'win32') return 'sh'
  // Git can be installed system-wide, per-user or in the bundled runtime.
  const gitPaths = execFileSync('where.exe', ['git'], { encoding: 'utf8' }).trim().split(/\r?\n/)
  const candidates = gitPaths.flatMap((git) => [join(dirname(git), '..', 'bin', 'sh.exe'), join(dirname(git), 'sh.exe')])
  candidates.push(join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git', 'bin', 'sh.exe'))
  const found = candidates.find(existsSync)
  if (!found) throw new Error('Git for Windows shell was not found; install Git Bash to run the deployment script tests.')
  return found
}
const SHELL = findShell()

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'vercel-ignore-'))
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], { cwd: dir, encoding: 'utf8' }).trim()
  const write = (path: string, text = String(Math.random())) => {
    mkdirSync(join(dir, dirname(path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  git('init', '-q')
  write('src/app.ts')
  write('README.md')
  git('add', '-A')
  git('commit', '-qm', 'base')
  const commit = (...paths: string[]) => {
    paths.forEach((path) => write(path))
    git('add', '-A')
    git('commit', '-qm', 'change')
  }
  const run = (previous: string | undefined) =>
    spawnSync(SHELL, [SCRIPT], { cwd: dir, env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous ?? '' } }).status
  return { dir, git, commit, run, base: git('rev-parse', 'HEAD') }
}

describe('vercel-ignore.sh', () => {
  it('skips the build when only docs, design, tests, CI or Markdown changed', () => {
    const { commit, run, base } = repo()
    commit('README.md', 'TASKS.md', 'docs/MEASUREMENTS.md', 'design/COPY.md', 'design/x.dc.html', 'e2e/a.spec.ts', '.github/workflows/ci.yml', 'src/qr/README.md')
    expect(run(base)).toBe(0)
  })

  it('builds when anything else changed, including the API', () => {
    for (const path of ['src/app.ts', 'api/sync.ts', 'server/db.ts', 'public/robots.txt', 'vercel.json', 'package.json', 'index.html']) {
      const { commit, run, base } = repo()
      commit('docs/notes.md', path)
      expect(run(base), path).toBe(1)
    }
  }, 20_000)

  it('builds when an app file moves into docs/ (both sides of the move count)', () => {
    const { dir, git, run, base } = repo()
    mkdirSync(join(dir, 'docs'))
    git('mv', 'src/app.ts', 'docs/app.ts')
    git('commit', '-qm', 'move')
    expect(run(base)).toBe(1)
  })

  it("builds when it can't tell: no previous commit, an unknown one, or no change", () => {
    const { run, git } = repo()
    expect(run(undefined)).toBe(1)
    expect(run('0123456789abcdef0123456789abcdef01234567')).toBe(1)
    expect(run(git('rev-parse', 'HEAD'))).toBe(1)
  })
})

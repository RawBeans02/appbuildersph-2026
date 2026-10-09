// Runs a TypeScript seed script with Vite's module runner (Node 20 can't run
// TypeScript on its own): node scripts/seed/run.mjs <script.ts> [args...]
// The script exports `main(args)`.
import { runnerImport } from 'vite'

const [script, ...args] = process.argv.slice(2)
if (!script) {
  console.error('usage: node scripts/seed/run.mjs <script.ts> [args...]')
  process.exit(2)
}
const { module } = await runnerImport(script, { configFile: false, logLevel: 'error' })
await module.main(args)

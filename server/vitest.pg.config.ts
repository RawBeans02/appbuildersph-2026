import { defineConfig } from 'vitest/config'

// `npm run test:api`: the API handlers against a real Postgres. CI runs it in
// the `api` job with a postgres:16 service container (.github/workflows/ci.yml);
// the build laptop never runs Postgres. Files share one database, so they run
// one at a time.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.pg.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})

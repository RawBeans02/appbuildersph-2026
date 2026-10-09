import { describe, expect, it } from 'vitest'
import { applySchema, DELETE_FUTURE_REPORTS, type Queryable } from './db.js'
import { NOW } from './test/fixtures.js'

// The schema pass without a database: which statements it sends, in what
// order. The SQL itself runs on a real Postgres in the api job
// (server/integration/).

function recorder(deleted: number) {
  const calls: { text: string; values?: unknown[] }[] = []
  const client = {
    query: async (text: string, values?: unknown[]) => {
      calls.push({ text, values })
      return { rowCount: text === DELETE_FUTURE_REPORTS ? deleted : 0, rows: [] }
    },
  } as unknown as Queryable
  return { client, calls }
}

describe('the schema pass', () => {
  it('deletes reports of a week that has not come yet, after the tables, inside the transaction', async () => {
    const { client, calls } = recorder(0)
    await applySchema(client, NOW)
    const texts = calls.map((call) => call.text)
    const at = texts.indexOf(DELETE_FUTURE_REPORTS)
    expect(at).toBeGreaterThan(texts.findIndex((text) => text.includes('CREATE TABLE IF NOT EXISTS reports')))
    expect(texts[0]).toBe('BEGIN')
    expect(texts.at(-1)).toBe('COMMIT')
    // The sync's own window: NOW is Saturday of 2026-W41 in Manila, so W42 is still accepted.
    expect(calls[at].values).toEqual(['2026-W42'])
    // Nothing deleted, nothing logged.
    expect(texts.some((text) => text.startsWith('INSERT INTO audit_log'))).toBe(false)
  })

  it('logs how many it deleted (counts only)', async () => {
    const { client, calls } = recorder(3)
    await applySchema(client, NOW)
    const audit = calls.find((call) => call.text.startsWith('INSERT INTO audit_log'))!
    expect(audit.values).toEqual([NOW, 'server', 'future-reports-deleted', JSON.stringify({ rows: 3, after: '2026-W42' })])
  })
})

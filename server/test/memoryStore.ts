import type { AlertRecord, AuditEntry, BarangayKeyRecord, DeviceRecord, ReportRecord, Store } from '../store.js'

// An in-memory Store for unit tests: the same rules as the SQL in db.ts
// (which the Postgres tests in server/integration/ check for real).

export type MemoryStore = Store & {
  devices: Map<string, DeviceRecord>
  keys: Map<string, BarangayKeyRecord>
  reports: Map<string, ReportRecord>
  nonces: Map<string, Date>
  rateLimits: Map<string, number>
  auditLog: AuditEntry[]
  alerts: Map<string, AlertRecord>
  lunaUsage: Map<string, number>
}

export function createMemoryStore(): MemoryStore {
  const devices = new Map<string, DeviceRecord>()
  const keys = new Map<string, BarangayKeyRecord>()
  const reports = new Map<string, ReportRecord>()
  const nonces = new Map<string, Date>()
  const rateLimits = new Map<string, number>()
  const auditLog: AuditEntry[] = []
  const alerts = new Map<string, AlertRecord>()
  const lunaUsage = new Map<string, number>()
  let nextAlertId = 1
  const newestFirst = (a: AlertRecord, b: AlertRecord) =>
    b.createdAt.getTime() - a.createdAt.getTime() || Number(b.id) - Number(a.id)

  const store: MemoryStore = {
    devices,
    keys,
    reports,
    nonces,
    rateLimits,
    auditLog,
    alerts,
    lunaUsage,

    async hitRateLimit(key, windowStart, purgeBefore) {
      for (const id of [...rateLimits.keys()]) {
        if (Number(id.split('@')[1]) < purgeBefore.getTime()) rateLimits.delete(id)
      }
      const id = `${key}@${windowStart.getTime()}`
      const count = (rateLimits.get(id) ?? 0) + 1
      rateLimits.set(id, count)
      return count
    },

    async claimNonce(nonce, now, purgeBefore) {
      for (const [id, seenAt] of [...nonces]) if (seenAt < purgeBefore) nonces.delete(id)
      if (nonces.has(nonce)) return false
      nonces.set(nonce, now)
      return true
    },

    async getDevice(fingerprint) {
      return devices.get(fingerprint) ?? null
    },

    async putDevice(device) {
      devices.set(device.fingerprint, { ...device })
    },

    async putBarangayKey(key) {
      if (!devices.has(key.vouchedBy)) throw new Error('vouched_by must be an enrolled device')
      const current = keys.get(key.barangay)
      if (current && current.fingerprint === key.fingerprint) return 'unchanged'
      keys.set(key.barangay, { ...key })
      return 'stored'
    },

    async barangayKeys(municipality, limit) {
      return [...keys.values()]
        .filter((key) => key.municipality === municipality)
        .sort((a, b) => (a.barangay < b.barangay ? -1 : 1))
        .slice(0, limit)
    },

    async putReport(report) {
      const id = `${report.barangay}|${report.epiWeek}`
      const current = reports.get(id)
      if (!current || current.seq < report.seq || current.phoneFingerprint !== report.phoneFingerprint) {
        reports.set(id, { ...report })
        return 'stored'
      }
      return current.seq === report.seq ? 'unchanged' : 'kept-newer'
    },

    async latestReports(municipality, limit) {
      const newest = new Map<string, ReportRecord>()
      for (const report of reports.values()) {
        if (report.municipality !== municipality) continue
        // Signed by the barangay's currently vouched key only (the SQL joins barangay_keys).
        const key = keys.get(report.barangay)
        if (!key || key.municipality !== municipality || key.fingerprint !== report.phoneFingerprint) continue
        const kept = newest.get(report.barangay)
        if (!kept || report.epiWeek > kept.epiWeek) newest.set(report.barangay, report)
      }
      return [...newest.values()].sort((a, b) => (a.barangay < b.barangay ? -1 : 1)).slice(0, limit)
    },

    async audit(entry) {
      auditLog.push(structuredClone(entry))
    },

    async auditTrail(municipality, actions, limit) {
      return auditLog
        .filter((entry) => actions.includes(entry.action) && entry.detail.municipality === municipality)
        .reverse()
        .slice(0, limit)
    },

    async takeLunaCall(day, limit) {
      const calls = lunaUsage.get(day) ?? 0
      if (limit < 1 || calls >= limit) return false
      lunaUsage.set(day, calls + 1)
      return true
    },

    async refundLunaCall(day) {
      const calls = lunaUsage.get(day) ?? 0
      if (calls > 0) lunaUsage.set(day, calls - 1)
    },

    async lunaCalls(day) {
      return lunaUsage.get(day) ?? 0
    },

    async insertAlerts(rows) {
      return rows.map((row) => {
        const record: AlertRecord = {
          ...structuredClone(row),
          id: String(nextAlertId++),
          status: 'draft',
          approvedByRole: null,
          approvedAt: null,
          decidedByRole: null,
          decidedAt: null,
        }
        alerts.set(record.id, record)
        return structuredClone(record)
      })
    },

    async getAlert(id) {
      const alert = alerts.get(id)
      return alert ? structuredClone(alert) : null
    },

    async decideAlert(id, decision) {
      const alert = alerts.get(id)
      if (!alert || alert.status !== 'draft') return null
      const approved = decision.status === 'approved'
      const updated: AlertRecord = {
        ...alert,
        status: decision.status,
        text: decision.text,
        decidedByRole: decision.role,
        decidedAt: decision.at,
        approvedByRole: approved ? decision.role : null,
        approvedAt: approved ? decision.at : null,
      }
      alerts.set(id, updated)
      return structuredClone(updated)
    },

    async listAlerts(municipality, statuses, limit) {
      return [...alerts.values()]
        .filter((alert) => alert.municipality === municipality && statuses.includes(alert.status))
        .sort(newestFirst)
        .slice(0, limit)
        .map((alert) => structuredClone(alert))
    },

    async approvedAlerts(municipality, barangays, limit) {
      return [...alerts.values()]
        .filter(
          (alert) =>
            alert.municipality === municipality &&
            alert.status === 'approved' &&
            (barangays === null || alert.audience.some((code) => barangays.includes(code))),
        )
        .sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0) || Number(b.id) - Number(a.id))
        .slice(0, limit)
        .map((alert) => structuredClone(alert))
    },

    async phoneKeys(fingerprint) {
      return [...keys.values()].filter((key) => key.fingerprint === fingerprint).sort((a, b) => (a.barangay < b.barangay ? -1 : 1))
    },

    // All or nothing, like the SQL transaction: on a throw, every map goes
    // back to how it was.
    async transaction(work) {
      const saved = {
        devices: new Map(devices),
        keys: new Map(keys),
        reports: new Map(reports),
        nonces: new Map(nonces),
        rateLimits: new Map(rateLimits),
        audit: auditLog.length,
      }
      try {
        return await work(store)
      } catch (error) {
        const restore = <K, V>(target: Map<K, V>, from: Map<K, V>) => {
          target.clear()
          for (const [k, v] of from) target.set(k, v)
        }
        restore(devices, saved.devices)
        restore(keys, saved.keys)
        restore(reports, saved.reports)
        restore(nonces, saved.nonces)
        restore(rateLimits, saved.rateLimits)
        auditLog.length = saved.audit
        throw error
      }
    },

    async ping() {
      return true
    },
  }
  return store
}

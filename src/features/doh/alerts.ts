import { formatCount, formatRange, isPlainObject, type Count, type CountRange } from '../../qr'
import { VIEW_CODE_HEADER, type AiStatus, type AlertView, type AlertsResponse, type AuditView, type DecideResponse, type DraftAlertsResponse } from '../../../server/protocol'
import { formatReceivedAt, nameOf } from '../municipal/counts'
import { callApi, type ApiResult, type Fetcher } from '../municipal/sync/client'

// The DOH view's alerts panel: its calls (behind the view code) and the words
// it shows. The panel never claims more than the check proves: a reworded
// alert passed a word-level check, so the officer still checks each number.

const viewHeaders = (code: string) => ({ [VIEW_CODE_HEADER]: code, 'content-type': 'application/json' })

export const alertsApi = {
  list: (code: string, municipality: string, fetcher: Fetcher = fetch): Promise<ApiResult<AlertsResponse>> =>
    callApi(fetcher, `/api/alerts?municipality=${encodeURIComponent(municipality)}`, { method: 'GET', headers: { [VIEW_CODE_HEADER]: code } }),
  draft: (code: string, municipality: string, fetcher: Fetcher = fetch): Promise<ApiResult<DraftAlertsResponse>> =>
    callApi(fetcher, '/api/alerts-draft', { method: 'POST', headers: viewHeaders(code), body: JSON.stringify({ municipality }) }),
  approve: (code: string, id: string, approverRole: string, text: string | null, fetcher: Fetcher = fetch): Promise<ApiResult<DecideResponse>> =>
    callApi(fetcher, '/api/alerts-approve', {
      method: 'POST',
      headers: viewHeaders(code),
      body: JSON.stringify(text === null ? { id, approverRole } : { id, approverRole, text }),
    }),
  reject: (code: string, id: string, role: string, fetcher: Fetcher = fetch): Promise<ApiResult<DecideResponse>> =>
    callApi(fetcher, '/api/alerts-reject', { method: 'POST', headers: viewHeaders(code), body: JSON.stringify({ id, role }) }),
}

// The same rule as the server (server/protocol.ts ROLE_PATTERN).
export const isRole = (role: string) => /^[A-Za-z][A-Za-z .'-]{2,59}$/.test(role)

const KIND: Record<AlertView['kind'], string> = {
  'doctor-team': 'Doctor team',
  'move-stock': 'Stock move',
  watch: 'Watch window',
}

export const kindLabel = (kind: AlertView['kind']) => KIND[kind]

const AI_OFF: Record<string, string> = {
  disabled: 'switched off',
  'no-key': 'no OpenAI key set',
  'no-limit': 'no daily limit set',
  'daily-limit': "today's limit is used up",
}

// "GPT-6 Luna: on · 4 of 50 calls today", or why it's off.
export function aiLine(status: AiStatus | null): { on: boolean; text: string } {
  if (!status) return { on: false, text: "AI off: the server can't be reached. Alerts need the server." }
  if (status.on) return { on: true, text: `GPT-6 Luna: on · ${status.callsToday} of ${status.dailyLimit} calls today` }
  return { on: false, text: `AI off: ${AI_OFF[status.reason] ?? status.reason}. Alerts use their template wording.` }
}

const NOTE: Record<string, string> = {
  disabled: 'AI off',
  'no-key': 'AI off',
  'no-limit': 'AI off',
  'daily-limit': "Today's AI limit was used up",
  timeout: 'GPT-6 Luna took too long',
  unreachable: "GPT-6 Luna couldn't be reached",
  auth: 'GPT-6 Luna refused the key',
  rejected: 'GPT-6 Luna refused the request',
  empty: 'GPT-6 Luna gave no wording',
}

// Where the wording came from, and what the check says: never "all
// numbers match".
export function sourceLine(alert: Pick<AlertView, 'source' | 'aiNote' | 'checkReasons'>): { tag: string; line: string } {
  if (alert.source === 'luna') {
    return {
      tag: 'Written by GPT-6 Luna',
      line: 'Checked: no new numbers, doses or barangays found. Check each number against the facts.',
    }
  }
  if (alert.aiNote === 'check-failed') {
    return { tag: 'Template', line: `GPT-6 Luna's wording didn't pass the check, so the template is shown: ${alert.checkReasons.join(' ')}` }
  }
  return { tag: 'Template', line: alert.aiNote ? `${NOTE[alert.aiNote] ?? 'AI not used'}: the wording comes from the facts only.` : 'The wording comes from the facts only.' }
}

const isRange = (value: unknown): value is CountRange =>
  isPlainObject(value) && typeof value.min === 'number' && typeof value.max === 'number'
const isCount = (value: unknown): value is Count => value === '<5' || typeof value === 'number'

function shown(value: unknown): string {
  if (isRange(value)) return formatRange(value)
  if (isCount(value)) return formatCount(value)
  return typeof value === 'string' ? value : ''
}

// The facts as label and value, in a fixed order per kind.
export function factRows(alert: Pick<AlertView, 'kind' | 'facts' | 'epiWeek'>): [string, string][] {
  const f = alert.facts
  const rows: [string, unknown][] =
    alert.kind === 'doctor-team'
      ? [
          ['Barangay', nameOf(String(f.barangay))],
          ['Priority score', f.score],
          ['Urgent referrals', f.urgentReferrals],
          ['Fast-breathing referrals', f.fastBreathing],
          ['In watch window', f.inWatchWindow],
        ]
      : alert.kind === 'move-stock'
        ? [
            ['From', nameOf(String(f.from))],
            ['To', nameOf(String(f.to))],
            ['Capsules expiring in 6 weeks (up to)', f.capsulesUpTo],
            ['From: in watch window', f.fromInWatchWindow],
            ['From: capsules on hand', f.fromOnHand],
            ['To: in watch window', f.toInWatchWindow],
            ['To: capsules on hand', f.toOnHand],
          ]
        : [
            ['Barangay', nameOf(String(f.barangay))],
            ['In watch window', f.inWatchWindow],
            ['Urgent referrals', f.urgentReferrals],
            ['Fast-breathing referrals', f.fastBreathing],
            ['Flags for clinician review', f.clinicianReviewFlags],
          ]
  return [...rows.map(([label, value]): [string, string] => [label, shown(value)]), ['Week', alert.epiWeek]]
}

const ACTION: Record<string, string> = {
  'alerts-draft': 'drafted alerts',
  'alert-approved': 'approved',
  'alert-rejected': 'rejected',
}

// One audit row: "10:05 AM · Provincial health officer approved #12 (Stock move)".
export function auditLine(entry: AuditView, now = new Date()): string {
  const when = formatReceivedAt(entry.at, now)
  const detail = entry.detail
  if (entry.action === 'alerts-draft') {
    const luna = Number(detail.luna ?? 0)
    const template = Number(detail.template ?? 0)
    return `${when} · DOH view drafted ${luna + template} alerts (${luna} by GPT-6 Luna, ${template} from the template)`
  }
  const kind = typeof detail.kind === 'string' && detail.kind in KIND ? ` (${KIND[detail.kind as AlertView['kind']]})` : ''
  const edited = detail.edited === true ? ', edited' : ''
  return `${when} · ${entry.actor} ${ACTION[entry.action] ?? entry.action} #${String(detail.id ?? '')}${kind}${edited}`
}

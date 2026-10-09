import { Link } from '../../app/Link'
import { useDbQuery } from '../../data/db/useDbQuery'
import { readApprovalLog } from './municipal'

// Screen 20: the approval log, newest first. Plain until design/ lands.
// NEEDS DESIGN: screen 20.

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function LogPage() {
  const data = useDbQuery(['approvals', 'plans'], readApprovalLog)

  return (
    <>
      <h1>Approval log</h1>
      <p>Every plan the officer approved on this laptop, newest first. Kept on this laptop only.</p>
      {data.status === 'loading' && <p>Loading…</p>}
      {data.status === 'error' && <p role="alert">Could not read the approval log.</p>}
      {data.status === 'ready' && data.data.length === 0 && (
        <p>
          No approvals yet. <Link to="/municipal/plan">Review and approve this week’s plan</Link>.
        </p>
      )}
      {data.status === 'ready' && data.data.length > 0 && (
        <ol>
          {data.data.map(({ approval, plan }) => (
            <li key={approval.id}>
              <p>
                <strong>{formatTime(approval.approvedAt)}</strong>, approved by: {approval.approver}
                {approval.sample ? ' · Sample data' : ''}
              </p>
              <p>{approval.planSummary}</p>
              {approval.note && <p>Note: {approval.note}</p>}
              {plan && (
                <details>
                  <summary>The approved plan text</summary>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>{plan.finalText}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

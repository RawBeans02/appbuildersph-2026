// POST /api/alerts-approve { id, municipality, approverRole, text? } (DOH view code): a
// person approves an alert; an edited wording is checked against its facts
// first. Thin wrapper; the logic and its tests are in server/.
import { defaultDeps, handleAlertsApprove } from '../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleAlertsApprove(request, defaultDeps())
}

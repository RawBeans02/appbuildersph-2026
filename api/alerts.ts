// GET /api/alerts?municipality=SID (DOH view code): open drafts, decided
// alerts and their audit trail. Thin wrapper; the logic and its tests are in
// server/.
import { defaultDeps, handleAlerts } from '../server/handlers.js'

export function GET(request: Request): Promise<Response> {
  return handleAlerts(request, defaultDeps())
}

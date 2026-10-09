// POST /api/alerts-reject { id, municipality, role } (DOH view code). Thin wrapper; the
// logic and its tests are in server/.
import { defaultDeps, handleAlertsReject } from '../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleAlertsReject(request, defaultDeps())
}

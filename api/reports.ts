// GET /api/reports?municipality=SID: the DOH view's latest report per
// barangay (suppressed counts only), behind the view code. Thin wrapper; the
// logic and its tests are in server/.
import { defaultDeps, handleReports } from '../server/handlers.js'

export function GET(request: Request): Promise<Response> {
  return handleReports(request, defaultDeps())
}

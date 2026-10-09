// POST /api/alerts-draft { municipality } (DOH view code): drafts alerts from
// the synced facts, worded by GPT-6 Luna only when it's on and its wording
// passes the check. Thin wrapper; the logic and its tests are in server/.
import { defaultDeps, handleAlertsDraft } from '../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleAlertsDraft(request, defaultDeps())
}

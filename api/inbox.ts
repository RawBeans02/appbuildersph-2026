// POST /api/inbox, signed like a sync: an enrolled laptop reads its
// municipality's approved alerts; a phone whose key a laptop vouched for reads
// its own barangay's. Thin wrapper; the logic and its tests are in server/.
import { defaultDeps, handleInbox } from '../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleInbox(request, defaultDeps())
}

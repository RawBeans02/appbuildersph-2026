// POST /api/sync: a registered laptop uploads its paired phones' keys and the
// barangay QRs it received; each QR is verified again here. Thin wrapper; the
// logic and its tests are in server/.
import { defaultDeps, handleSync } from '../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleSync(request, defaultDeps())
}

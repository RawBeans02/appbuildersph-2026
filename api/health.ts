// GET /api/health: whether the database and each setting are configured, as
// booleans; never a value. Thin wrapper; the logic and its tests are in server/.
import { defaultDeps, handleHealth } from '../server/handlers.js'

export function GET(request: Request): Promise<Response> {
  return handleHealth(request, defaultDeps())
}

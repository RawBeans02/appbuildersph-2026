// POST /api/enroll: a municipal laptop registers its own key once with the
// enroll code. Thin wrapper; the logic and its tests are in server/.
import { defaultDeps, handleEnroll } from '../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleEnroll(request, defaultDeps())
}

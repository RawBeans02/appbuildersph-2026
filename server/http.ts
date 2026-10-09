import { MAX_BODY_BYTES, type ErrorCode, type ErrorResponse } from './protocol.js'

// Responses and request reading for the Web-standard handlers (Request in,
// Response out), as Vercel's Node.js runtime calls them.

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // Never cached: not by the browser, the service worker or a proxy.
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...headers } })
}

const STATUS: Record<ErrorCode, number> = {
  'not-configured': 503,
  'bad-request': 400,
  'too-large': 413,
  'rate-limited': 429,
  'stale-request': 401,
  'unknown-device': 401,
  'bad-signature': 401,
  replayed: 409,
  'wrong-code': 403,
  'not-found': 404,
  'already-decided': 409,
  superseded: 409,
  'check-failed': 422,
  'server-error': 500,
}

// The error's message is fixed text: it never echoes the request.
export function fail(error: ErrorCode, message: string, headers: Record<string, string> = {}, reasons?: string[]): Response {
  const body: ErrorResponse = reasons ? { ok: false, error, message, reasons } : { ok: false, error, message }
  return json(STATUS[error], body, headers)
}

export class HttpError extends Error {
  readonly code: ErrorCode
  readonly headers: Record<string, string>
  // The check's reasons, for check-failed: fixed sentences about the wording.
  readonly reasons: string[] | undefined
  constructor(code: ErrorCode, message: string, headers: Record<string, string> = {}, reasons?: string[]) {
    super(message)
    this.name = 'HttpError'
    this.code = code
    this.headers = headers
    this.reasons = reasons
  }
  toResponse(): Response {
    return fail(this.code, this.message, this.headers, this.reasons)
  }
}

const tooLarge = () => new HttpError('too-large', `The request body is larger than ${MAX_BODY_BYTES / 1024} KB.`)

// Refuses an oversized body from its Content-Length, before any work.
export function checkDeclaredLength(request: Request, limit = MAX_BODY_BYTES): void {
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > limit) throw tooLarge()
}

// The exact body bytes, read up to `limit` (a missing or false Content-Length
// can't get past it).
export async function readBody(request: Request, limit = MAX_BODY_BYTES): Promise<Uint8Array<ArrayBuffer>> {
  checkDeclaredLength(request, limit)
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

// Parses UTF-8 JSON, or a 400.
export function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new HttpError('bad-request', 'The body is not UTF-8 JSON.')
  }
}

// The client's address as Vercel's edge reports it, for rate limits only (it
// is hashed before it reaches the database; see rateLimit.ts).
export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim()
  if (real) return real
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || 'unknown'
}

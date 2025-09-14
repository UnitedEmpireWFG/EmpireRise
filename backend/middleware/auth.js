// backend/middleware/auth.js
// Simple, robust auth that trusts the Supabase session token your frontend sends.
// - Accepts any Bearer token (issued by Supabase SDK on the frontend).
// - Decodes the JWT payload WITHOUT verifying (for convenience fields like email).
// - Exports requireAuth and requireAdmin (admin via token role or ADMIN_EMAILS list).

import 'dotenv/config'

/** Safely decode a JWT payload WITHOUT verification (base64url → JSON). */
function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split('.')
    if (!payload) return {}
    // base64url decode
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json || '{}') || {}
  } catch {
    return {}
  }
}

/** Attach req.user from the Bearer token (no JWKS verification). */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    return res.status(401).json({ ok: false, error: 'unauthorized: missing token' })
  }

  const payload = decodeJwtPayload(token)

  // Normalize common fields (best-effort; depends on your Supabase config)
  const user = {
    token,
    sub: payload.sub || payload.user_id || null,
    email:
      payload.email ||
      payload.user_metadata?.email ||
      payload?.['https://hasura.io/jwt/claims']?.['x-hasura-user-email'] ||
      null,
    app_role:
      payload.app_role ||
      payload.user_metadata?.app_role ||
      payload.app_metadata?.app_role ||
      null,
    raw: payload
  }

  req.user = user
  next()
}

/**
 * Admin gate:
 *  - allows if req.user.app_role === 'admin'
 *  - OR if req.user.email is in comma-separated env ADMIN_EMAILS
 *    (e.g. ADMIN_EMAILS=you@domain.com,other@domain.com)
 */
export function requireAdmin(req, res, next) {
  const role = req.user?.app_role
  if (role === 'admin') return next()

  const admins =
    String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)

  const email = String(req.user?.email || '').toLowerCase()
  if (email && admins.includes(email)) return next()

  return res.status(403).json({ ok: false, error: 'forbidden' })
}
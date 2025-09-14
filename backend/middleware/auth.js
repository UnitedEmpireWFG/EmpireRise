/* backend/middleware/auth.js */
import 'dotenv/config'
import * as jose from 'jose'

/**
 * JWKS for Supabase JWT verification
 * SUPABASE_JWKS_URL example: https://YOURPROJECT.supabase.co/auth/v1/keys
 */
const JWKS_URL = process.env.SUPABASE_JWKS_URL
let JWKS = null
if (JWKS_URL) {
  try {
    JWKS = jose.createRemoteJWKSet(new URL(JWKS_URL))
  } catch (e) {
    console.error('[auth] bad SUPABASE_JWKS_URL:', e?.message || e)
  }
}

/**
 * Preflight/health bypass so CORS OPTIONS and basic probes never hit auth.
 * You already mount this BEFORE CORS in server.js.
 */
export function maybeBypass(req, res, next) {
  if (req.method === 'OPTIONS') {
    // Mirror CORS headers for fast preflight exit
    const origin = req.headers.origin || '*'
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,x-app-key')
    return res.status(204).end()
  }

  // Allow anonymous root/health checks (server.js also exposes these before auth)
  if (req.method === 'HEAD' && req.path === '/') return res.status(200).end()
  if (req.method === 'GET'  && (req.path === '/' || req.path === '/healthz')) {
    return res.status(200).type('text/plain').send('ok')
  }

  return next()
}

/**
 * Strict Supabase JWT auth.
 * - Reads "Authorization: Bearer <token>"
 * - Verifies against Supabase JWKS
 * - Audience is 'authenticated' (what Supabase issues to logged-in users)
 */
export async function requireAuth(req, res, next) {
  try {
    if (!JWKS) throw new Error('jwks_not_configured')

    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) throw new Error('missing_token')

    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: 'supabase',
      audience: 'authenticated',
    })

    // Attach the verified user to the request
    req.user = payload || {}
    return next()
  } catch (e) {
    // Minimal, safe debug. Comment out if you don't want noise in Render logs.
    console.log('[auth debug] requireAuth fail:', e?.message || e)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}

/**
 * Admin gate:
 * - Allows if JWT has app_role === 'admin' (in app_metadata or user_metadata)
 * - OR if email is listed in env ADMIN_EMAILS (comma-separated)
 */
export function requireAdmin(req, res, next) {
  const role =
    req.user?.app_metadata?.app_role ||
    req.user?.user_metadata?.app_role ||
    req.user?.app_role

  if (role === 'admin') return next()

  const email = req.user?.email || req.user?.sub || ''
  const allow = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)

  if (email && allow.includes(String(email).toLowerCase())) return next()

  return res.status(403).json({ ok: false, error: 'forbidden' })
}
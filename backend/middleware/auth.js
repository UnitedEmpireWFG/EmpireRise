import 'dotenv/config'
import * as jose from 'jose'

/**
 * ENV NEEDED (Render backend):
 * - SUPABASE_URL=https://<project-ref>.supabase.co
 * - SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/keys  (optional; auto-derives from SUPABASE_URL)
 * - AUTH_DEBUG=true|false  (optional)
 * - AUTH_BYPASS=false      (leave false in prod)
 */

const DEBUG = String(process.env.AUTH_DEBUG || 'false') === 'true'
const BYPASS = String(process.env.AUTH_BYPASS || 'false') === 'true'

function dlog(...args) { if (DEBUG) console.log('[auth]', ...args) }

const SUPABASE_URL = process.env.SUPABASE_URL
if (!SUPABASE_URL) {
  console.error('[auth] Missing SUPABASE_URL env. JWT verification will fail.')
}
const JWKS_URL = process.env.SUPABASE_JWKS_URL || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/,'')}/auth/v1/keys` : null)
if (!JWKS_URL) {
  console.error('[auth] Missing SUPABASE_JWKS_URL and cannot derive from SUPABASE_URL.')
}

const JWKS = JWKS_URL ? jose.createRemoteJWKSet(new URL(JWKS_URL)) : null

function getBearer(req) {
  const auth = req.headers.authorization || req.headers.Authorization || ''
  const m = String(auth).match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

// Optional bypass helper (exported because some files might import it)
export function maybeBypass(req, _res, next) {
  if (BYPASS) {
    req.user = { sub: 'bypass', email: 'bypass@example.com', role: 'admin' }
    return next()
  }
  return next()
}

export async function requireAuth(req, res, next) {
  try {
    // Always allow CORS preflight
    if (req.method === 'OPTIONS') return res.status(204).end()

    if (BYPASS) {
      req.user = { sub: 'bypass', email: 'bypass@example.com', role: 'admin' }
      return next()
    }

    const token = getBearer(req)
    if (!token) {
      dlog('missing_token', { path: req.path, method: req.method })
      return res.status(401).json({ ok:false, error:'unauthorized' })
    }

    if (!JWKS) throw new Error('jwks_not_configured')

    // Supabase access tokens have iss "supabase". We do NOT enforce audience here.
    const { payload } = await jose.jwtVerify(token, JWKS, { issuer: 'supabase' })
    req.user = payload || {}
    return next()
  } catch (e) {
    dlog('verify_failed', { path: req.path, method: req.method, err: e?.message })
    return res.status(401).json({ ok:false, error:'unauthorized' })
  }
}

export function requireAdmin(req, res, next) {
  // Accept admin role from any of these fields (Supabase app_metadata/user_metadata vary)
  const role =
    req.user?.app_metadata?.app_role ||
    req.user?.user_metadata?.app_role ||
    req.user?.role ||
    req.user?.app_role

  if (role === 'admin') return next()
  return res.status(403).json({ ok:false, error:'forbidden' })
}
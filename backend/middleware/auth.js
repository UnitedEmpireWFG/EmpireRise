import 'dotenv/config'
import * as jose from 'jose'

const BYPASS = String(process.env.AUTH_BYPASS || 'false').toLowerCase() === 'true'
const BYPASS_SECRET = process.env.AUTH_BYPASS_SECRET || 'dev'
const JWKS_URL = process.env.SUPABASE_JWKS_URL
if (!BYPASS && !JWKS_URL) {
  console.warn('[auth] SUPABASE_JWKS_URL missing. All protected calls will 401.')
}
const JWKS = JWKS_URL ? jose.createRemoteJWKSet(new URL(JWKS_URL)) : null

/** Optional logging helper */
function logAuth(msg, extra = {}) {
  const base = { tag: 'auth', ...extra }
  try { console.log('[auth]', msg, JSON.stringify(base)) }
  catch { console.log('[auth]', msg) }
}

/** Admin gate (reads app_role from user payload) */
export function requireAdmin(req, res, next) {
  const role =
    req.user?.app_metadata?.app_role ||
    req.user?.user_metadata?.app_role ||
    req.user?.app_role
  if (role === 'admin') return next()
  return res.status(403).json({ ok: false, error: 'forbidden' })
}

/** Testing only: allow everything through while logging */
export function maybeBypass(req, _res, next) {
  if (!BYPASS) return next()
  req.user = { sub: 'bypass-user', app_role: 'admin', bypass: true }
  logAuth('BYPASS on', { path: req.path, method: req.method })
  next()
}

/** Real auth middleware (Supabase JWT verify) */
export async function requireAuth(req, res, next) {
  // Bypass wins for testing
  if (BYPASS) return maybeBypass(req, res, next)

  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) {
      logAuth('missing_token', { path: req.path, method: req.method })
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    if (!JWKS) {
      logAuth('jwks_not_configured', { path: req.path })
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }

    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: 'supabase',
      audience: process.env.SUPABASE_URL
    })
    req.user = payload || {}
    next()
  } catch (e) {
    logAuth('verify_failed', {
      path: req.path,
      method: req.method,
      msg: e?.message || String(e)
    })
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}
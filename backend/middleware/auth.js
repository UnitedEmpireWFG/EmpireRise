// backend/middleware/auth.js
import 'dotenv/config'
import * as jose from 'jose'

const SUPABASE_URL = process.env.SUPABASE_URL
if (!SUPABASE_URL) {
  // Fail fast so we don't silently 401 everything
  console.error('[auth] SUPABASE_URL is missing')
}

const JWKS_URL = `${SUPABASE_URL}/auth/v1/keys`
const EXPECTED_ISS = `${SUPABASE_URL}/auth/v1`
const EXPECTED_AUD = 'authenticated'

// Remote JWKS for Supabase
const JWKS = jose.createRemoteJWKSet(new URL(JWKS_URL))

const BYPASS = String(process.env.AUTH_BYPASS || 'false').toLowerCase() === 'true'
const DEBUG  = String(process.env.AUTH_DEBUG  || 'true').toLowerCase() === 'true' // leave on while fixing

export function maybeBypass(req, _res, next) {
  if (BYPASS) {
    if (DEBUG) console.log('[auth] BYPASS on', { path: req.path })
    req.user = { bypass: true }
    return next()
  }
  return next()
}

export async function requireAuth(req, res, next) {
  if (BYPASS) return next()

  try {
    const auth = req.headers.authorization || ''
    if (!auth.startsWith('Bearer ')) {
      if (DEBUG) console.log('[auth] missing_token', { path: req.path, method: req.method })
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }

    const token = auth.slice(7)

    // Verify with correct issuer & audience for Supabase v2
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: EXPECTED_ISS,
      audience: EXPECTED_AUD
    })

    req.user = payload || {}
    if (DEBUG) {
      console.log('[auth] ok', {
        sub: req.user.sub,
        email: req.user.email,
        iss: req.user.iss,
        aud: req.user.aud,
        path: req.path
      })
    }
    return next()
  } catch (e) {
    if (DEBUG) console.log('[auth] verify_failed', { path: req.path, message: e?.message })
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}

export function requireAdmin(req, res, next) {
  const role =
    req.user?.app_metadata?.app_role ||
    req.user?.user_metadata?.app_role ||
    req.user?.app_role

  if (role === 'admin' || req.user?.bypass) return next()
  return res.status(403).json({ ok: false, error: 'forbidden' })
}

// Optional: tiny helper to dump whoami payload (mount this route in server)
export function whoAmI(req, res) {
  if (!req.user) return res.status(401).json({ ok:false, error:'unauthorized' })
  res.json({ ok:true, user: req.user })
}
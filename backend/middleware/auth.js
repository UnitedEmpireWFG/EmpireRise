import 'dotenv/config'
import * as jose from 'jose'

const AUTH_DEBUG = String(process.env.AUTH_DEBUG || 'false') === 'true'
const AUTH_BYPASS = String(process.env.AUTH_BYPASS || 'false') === 'true'

// Build the expected issuer prefix like: https://xyzcompany.supabase.co/auth/v1
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const EXPECT_ISS = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : null

// Remote JWKS from Supabase
const JWKS_URL =
  process.env.SUPABASE_JWKS_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/keys` : null)

if (!JWKS_URL) {
  console.warn('[auth] WARNING: SUPABASE_JWKS_URL (or SUPABASE_URL) not set — JWT verification will fail.')
}

const JWKS = JWKS_URL ? jose.createRemoteJWKSet(new URL(JWKS_URL)) : null

function dbg(msg, extra) {
  if (!AUTH_DEBUG) return
  try {
    console.log('[auth]', msg, extra ? JSON.stringify(extra) : '')
  } catch {
    console.log('[auth]', msg)
  }
}

/**
 * Try to verify a Supabase JWT.
 * Strategy:
 *  1) Strict: audience 'authenticated', issuer startsWith EXPECT_ISS
 *  2) Fallback: no audience check, tolerate small clock skew
 */
async function verifySupabaseJWT(token) {
  if (!JWKS) throw new Error('jwks_unavailable')

  // Decode first just for logging/inspection
  let decoded = null
  try {
    decoded = jose.decodeJwt(token)
  } catch {
    // ignore
  }
  dbg('decoded_header', { iss: decoded?.iss, aud: decoded?.aud, sub: decoded?.sub })

  // Strict path
  try {
    const strictRes = await jose.jwtVerify(token, JWKS, {
      audience: 'authenticated',
      issuer: EXPECT_ISS || undefined,
      clockTolerance: 10 // seconds
    })
    return strictRes.payload
  } catch (e) {
    dbg('strict_verify_failed', { msg: e.message })
  }

  // Fallback (broader) — accept tokens that come from Supabase but have odd aud
  const fallback = await jose.jwtVerify(token, JWKS, {
    clockTolerance: 15
  })
  // If we still have issuer, sanity check it loosely
  if (EXPECT_ISS && typeof fallback.payload.iss === 'string') {
    if (!fallback.payload.iss.startsWith(EXPECT_ISS)) {
      throw new Error('issuer_mismatch')
    }
  }
  return fallback.payload
}

export async function requireAuth(req, res, next) {
  try {
    // Bypass (for setup emergencies only)
    if (AUTH_BYPASS) {
      dbg('bypass_on', { path: req.path })
      req.user = { sub: 'bypass', role: 'admin', app_role: 'admin' }
      return next()
    }

    // Pull Bearer token
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) {
      dbg('missing_token', { path: req.path, method: req.method })
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }

    // Verify
    const payload = await verifySupabaseJWT(token)

    // Attach user and go on
    req.user = payload || {}
    dbg('ok', { sub: req.user?.sub, role: req.user?.role, path: req.path })
    next()
  } catch (e) {
    dbg('verify_failed', { path: req.path, err: e.message })
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}

export function requireAdmin(req, res, next) {
  const role =
    req.user?.app_metadata?.app_role ||
    req.user?.user_metadata?.app_role ||
    req.user?.app_role ||
    req.user?.role

  if (role === 'admin') return next()
  return res.status(403).json({ ok: false, error: 'forbidden' })
}
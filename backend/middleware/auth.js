// backend/middleware/auth.js
import 'dotenv/config'
import * as jose from 'jose'

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const JWKS_URL = `${SUPABASE_URL}/auth/v1/keys`
const JWKS = jose.createRemoteJWKSet(new URL(JWKS_URL))

const AUTH_DEBUG = String(process.env.AUTH_DEBUG || 'false') === 'true'
const AUTH_BYPASS = String(process.env.AUTH_BYPASS || 'false') === 'true'

// Audiences Supabase commonly sets on access tokens
const ACCEPTED_AUDIENCES = new Set(['authenticated', 'supabase'])

function log(tag, obj = {}) {
  if (!AUTH_DEBUG) return
  try { console.log(`[auth] ${tag}`, JSON.stringify(obj)) }
  catch { console.log(`[auth] ${tag}`, obj) }
}

export function maybeBypass(req, res, next) {
  if (AUTH_BYPASS) {
    req.user = { sub: 'bypass', app_role: 'admin', bypass: true }
    return next()
  }
  next()
}

// Allow preflight without auth
export function allowOptions(req, res, next) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
}

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) {
      log('missing_token', { path: req.path, method: req.method })
      throw new Error('missing_token')
    }

    const { payload, protectedHeader } = await jose.jwtVerify(token, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      // We accept multiple audiences to avoid mismatch errors
      audience: (aud) => ACCEPTED_AUDIENCES.has(String(aud))
    })

    // Optional: sanity checks typical on Supabase access tokens
    if (!payload.sub || !payload.role) {
      log('bad_payload', { payload })
      throw new Error('bad_payload')
    }

    req.user = payload
    if (AUTH_DEBUG) {
      log('ok', {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        aud: payload.aud,
        iss: payload.iss,
        alg: protectedHeader?.alg
      })
    }
    next()
  } catch (e) {
    log('verify_fail', { path: req.path, method: req.method, msg: e?.message })
    res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}

// Admin gate used by admin routes; graceful when missing
export function requireAdmin(req, res, next) {
  const role =
    req.user?.app_metadata?.app_role ||
    req.user?.user_metadata?.app_role ||
    req.user?.role ||
    req.user?.app_role

  if (role === 'admin') return next()
  return res.status(403).json({ ok: false, error: 'forbidden' })
}

// Debug endpoint handler (mounted in server.js)
export function whoAmI(req, res) {
  res.json({
    ok: true,
    bypass: !!req.user?.bypass,
    user: req.user || null
  })
}
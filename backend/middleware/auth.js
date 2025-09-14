// backend/middleware/auth.js
import 'dotenv/config'
import * as jose from 'jose'

/**
 * Supabase (GoTrue v2) access tokens have:
 *   iss: https://<project>.supabase.co/auth/v1
 *   aud: "authenticated"
 * They are signed with keys exposed at:  <SUPABASE_URL>/auth/v1/keys
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const JWKS_URL = process.env.SUPABASE_JWKS_URL || (SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/keys` : '')
const GOTRUE_ISS = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : null

if (!JWKS_URL) {
  console.warn('[auth] SUPABASE_JWKS_URL missing. Set SUPABASE_URL or SUPABASE_JWKS_URL in env.')
}

const JWKS = jose.createRemoteJWKSet(new URL(JWKS_URL))

async function verifySupabaseJWT(token) {
  // Strict pass: real issuer + audience
  try {
    return await jose.jwtVerify(token, JWKS, {
      issuer: GOTRUE_ISS || undefined,
      audience: 'authenticated',
      algorithms: ['RS256', 'ES256']
    })
  } catch (e1) {
    // Fallback pass: still JWKS-verified but no iss/aud constraints
    try {
      const res = await jose.jwtVerify(token, JWKS, {
        algorithms: ['RS256', 'ES256']
      })
      console.log('[auth] fallback verify ok (no iss/aud). header.alg=%s', res.protectedHeader?.alg)
      return res
    } catch (e2) {
      // Bubble up the original strict error (most informative)
      e1.message = `[verify] ${e1.message}`
      throw e1
    }
  }
}

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
    if (!token) throw new Error('missing_token')

    // Verify and attach user
    const { payload } = await verifySupabaseJWT(token)
    req.user = payload || {}
    return next()
  } catch (err) {
    // Minimal but actionable debug (shows in Render logs)
    const path = req.originalUrl || req.url
    console.log('[auth 401] %s – %s', path, err?.message || err)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}

export function requireAdmin(req, res, next) {
  const role =
    req.user?.app_metadata?.app_role ||
    req.user?.user_metadata?.app_role ||
    req.user?.app_role
  if (role === 'admin') return next()
  return res.status(403).json({ ok: false, error: 'forbidden' })
}
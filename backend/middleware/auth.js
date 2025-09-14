import 'dotenv/config'
import * as jose from 'jose'

// Supabase tokens (GoTrue v2) have:
//   iss = https://<project>.supabase.co/auth/v1
//   aud = "authenticated"
// We must verify against that exact issuer + audience.
const SUPABASE_URL   = process.env.SUPABASE_URL
const SUPABASE_ISS   = `${SUPABASE_URL.replace(/\/+$/,'')}/auth/v1`
const SUPABASE_JWKS  = process.env.SUPABASE_JWKS_URL || `${SUPABASE_ISS}/keys`

// Reuse the remote JWKS for verification
const JWKS = jose.createRemoteJWKSet(new URL(SUPABASE_JWKS))

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) throw new Error('missing_token')

    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: SUPABASE_ISS,
      audience: 'authenticated'
    })

    // attach a compact user object so routes can use it
    req.user = {
      sub:      payload.sub,
      email:    payload.email,
      role:     payload.role || payload.user_role || null,
      app_role: payload.app_role || payload?.user_metadata?.app_role || null,
      app_metadata: payload.app_metadata || null,
      user_metadata: payload.user_metadata || null
    }

    return next()
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}

export function requireAdmin(req, res, next) {
  const role =
    req.user?.app_role ||
    req.user?.app_metadata?.app_role ||
    req.user?.user_metadata?.app_role

  if (role === 'admin') return next()
  return res.status(403).json({ ok: false, error: 'forbidden' })
}
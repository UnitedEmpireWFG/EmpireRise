/* backend/middleware/auth.js */
import 'dotenv/config'
import * as jose from 'jose'

// Build JWKS URL (works even if SUPABASE_JWKS_URL isn't set)
const jwksUrl =
  process.env.SUPABASE_JWKS_URL ||
  `${process.env.SUPABASE_URL?.replace(/\/+$/,'')}/auth/v1/keys`

const JWKS = jose.createRemoteJWKSet(new URL(jwksUrl))

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) throw new Error('missing_token')

    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: 'supabase',
      audience: process.env.SUPABASE_URL
    })

    req.user = payload || {}
    next()
  } catch {
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
<<<<<<< HEAD
}
=======
}
>>>>>>> bf5cadf (Update frontend (Navbar, apiFetch, App))

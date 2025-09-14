// backend/middleware/auth.js
import 'dotenv/config'
import * as jose from 'jose'

const JWKS = jose.createRemoteJWKSet(new URL(process.env.SUPABASE_JWKS_URL))

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) throw new Error('missing_token')

    // Try both issuer formats (with or without /auth/v1)
    let payload
    try {
      const verified = await jose.jwtVerify(token, JWKS, {
        issuer: process.env.SUPABASE_URL, // base URL
      })
      payload = verified.payload
    } catch (e1) {
      const verified = await jose.jwtVerify(token, JWKS, {
        issuer: process.env.SUPABASE_URL + '/auth/v1',
      })
      payload = verified.payload
    }

    req.user = payload || {}
    return next()
  } catch (e) {
    console.error('Auth failed:', e.message)
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
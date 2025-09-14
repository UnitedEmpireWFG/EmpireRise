// backend/middleware/auth.js
import 'dotenv/config'
import * as jose from 'jose'

const JWKS = jose.createRemoteJWKSet(new URL(process.env.SUPABASE_JWKS_URL))

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

    console.log('[auth debug] requireAuth hit. Path:', req.path)
    console.log('[auth debug] Authorization header:', auth)

    if (!token) throw new Error('missing_token')

    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: 'supabase',
      audience: process.env.SUPABASE_URL
    })

    console.log('[auth debug] Token verified. Payload:', payload)

    req.user = payload || {}
    next()
  } catch (e) {
    console.error('[auth debug] Verification failed:', e.message)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}

export function requireAdmin(req, res, next) {
  const role =
    req.user?.app_metadata?.app_role ||
    req.user?.user_metadata?.app_role ||
    req.user?.app_role

  if (role === 'admin') return next()
  console.error('[auth debug] requireAdmin blocked. Role:', role)
  return res.status(403).json({ ok: false, error: 'forbidden' })
}
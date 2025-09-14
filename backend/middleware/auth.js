// backend/middleware/auth.js
import 'dotenv/config'
import * as jose from 'jose'

// JWKS endpoint from Supabase (env SUPABASE_JWKS_URL = `${SUPABASE_URL}/auth/v1/keys`)
const JWKS = jose.createRemoteJWKSet(new URL(process.env.SUPABASE_JWKS_URL))

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) throw new Error('missing_token')

    // Validate signature; accept the standard Supabase audience
    const { payload } = await jose.jwtVerify(token, JWKS, {
      audience: 'authenticated',     // <- important
      // issuer check is optional for Supabase; omit to avoid mismatches
    })

    req.user = payload || {}
    next()
  } catch {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}
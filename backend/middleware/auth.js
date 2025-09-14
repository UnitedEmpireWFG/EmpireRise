// backend/middleware/auth.js
import 'dotenv/config'
import * as jose from 'jose'

const JWKS_URL = process.env.SUPABASE_JWKS_URL // e.g. https://<ref>.supabase.co/auth/v1/keys
if (!JWKS_URL) {
  console.warn('[auth] SUPABASE_JWKS_URL is not set — all requests will fail auth')
}

const DEBUG = String(process.env.DEBUG_AUTH || 'false').toLowerCase() === 'true'
const jwks = JWKS_URL ? jose.createRemoteJWKSet(new URL(JWKS_URL)) : null

function dbg(...args) {
  if (DEBUG) console.log('[auth]', ...args)
}

// Allow preflight to pass through without noise
export function maybeBypass(req, res, next) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
}

export async function requireAuth(req, res, next) {
  try {
    // Render/Netlify health probes often hit these without a token—let public routes handle them.
    if (req.path === '/' || req.path === '/healthz') return next()

    const auth = req.headers.authorization || ''
    const hasBearer = auth.startsWith('Bearer ')
    dbg('path:', req.path, '| hasBearer:', hasBearer)

    if (!hasBearer) throw new Error('missing_token')

    const token = auth.slice(7)

    // Supabase v2 access tokens:
    //  iss: "supabase"
    //  aud: "authenticated"
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: 'supabase',
      audience: 'authenticated', // ← key fix: do NOT use SUPABASE_URL here
    })

    // Attach user to request
    req.user = payload
    return next()
  } catch (e) {
    dbg('verify_failed:', e?.message || e)
    // Normalize to 401 for the frontend
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}
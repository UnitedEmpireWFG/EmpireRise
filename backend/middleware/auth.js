import 'dotenv/config'
import { supaAdmin } from '../db.js'

const DEBUG   = String(process.env.AUTH_DEBUG || 'false') === 'true'
const BYPASS  = String(process.env.AUTH_BYPASS || 'false') === 'true'
const HAS_SVC = !!process.env.SUPABASE_SERVICE_ROLE_KEY

function dlog(...args) { if (DEBUG) console.log('[auth]', ...args) }

function getBearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || ''
  const m = String(h).match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

// Optional: let requests through if AUTH_BYPASS=true (for emergencies only)
export function maybeBypass(req, _res, next) {
  if (BYPASS) {
    req.user = { sub: 'bypass', email: 'bypass@example.com', role: 'admin' }
  }
  next()
}

export async function requireAuth(req, res, next) {
  try {
    // Always allow CORS preflight
    if (req.method === 'OPTIONS') return res.status(204).end()

    if (BYPASS) {
      req.user = { sub: 'bypass', email: 'bypass@example.com', role: 'admin' }
      return next()
    }

    const token = getBearer(req)
    if (!token) {
      dlog('missing_token', { path: req.path, method: req.method })
      return res.status(401).json({ ok:false, error:'unauthorized' })
    }

    if (!HAS_SVC) {
      dlog('no_service_role_key', { msg: 'Set SUPABASE_SERVICE_ROLE_KEY in Render.' })
      return res.status(500).json({ ok:false, error:'server_misconfigured' })
    }

    // ✅ Validate with Supabase Admin (verifies signature & validity)
    const { data, error } = await supaAdmin.auth.getUser(token)
    if (error || !data?.user) {
      dlog('supabase_validate_failed', { err: error?.message || 'no_user' })
      return res.status(401).json({ ok:false, error:'unauthorized' })
    }

    // Attach a minimal user (use whatever fields your routes expect)
    const u = data.user
    req.user = {
      sub: u.id,
      email: u.email,
      app_metadata: u.app_metadata || {},
      user_metadata: u.user_metadata || {}
    }

    dlog('ok', { sub: req.user.sub, email: req.user.email, path: req.path })
    return next()
  } catch (e) {
    dlog('verify_exception', { path: req.path, method: req.method, err: e?.message })
    return res.status(401).json({ ok:false, error:'unauthorized' })
  }
}

export function requireAdmin(req, res, next) {
  const role =
    req.user?.app_metadata?.app_role ||
    req.user?.user_metadata?.app_role ||
    req.user?.role ||
    req.user?.app_role

  if (role === 'admin') return next()
  return res.status(403).json({ ok:false, error:'forbidden' })
}
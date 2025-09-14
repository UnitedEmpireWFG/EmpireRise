import 'dotenv/config'

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split('.')
    if (!payload) return {}
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json || '{}') || {}
  } catch { return {} }
}

export function requireAuth(req, res, next) {
  const h = req.headers
  const fromBearer = (h.authorization || '').startsWith('Bearer ')
    ? h.authorization.slice(7).trim()
    : ''
  const token = fromBearer || (h['x-supa-token'] ? String(h['x-supa-token']) : '')

  if (!token) {
    return res.status(401).json({ ok:false, error:'unauthorized: missing token' })
  }

  const payload = decodeJwtPayload(token)
  req.user = {
    token,
    sub: payload.sub || payload.user_id || null,
    email: payload.email || payload.user_metadata?.email || null,
    app_role: payload.app_role || payload.user_metadata?.app_role || null,
    raw: payload
  }
  next()
}

export function requireAdmin(req, res, next) {
  const role = req.user?.app_role
  if (role === 'admin') return next()

  const admins = String(process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const email = String(req.user?.email || '').toLowerCase()
  if (email && admins.includes(email)) return next()

  return res.status(403).json({ ok:false, error:'forbidden' })
}
// backend/routes/oauth_linkedin.js
import express from 'express'
import fetch from 'node-fetch'
import crypto from 'node:crypto'
import { supaAdmin } from '../db.js'

const router = express.Router()

// ---- env (keeps your LINKEDIN_* names) ----
const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET
const REDIRECT      = (
  process.env.LINKEDIN_REDIRECT ||
  process.env.LI_REDIRECT ||
  'https://empirerise.onrender.com/oauth/linkedin/callback'
).replace(/\/+$/, '')

const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || 'https://empirerise.netlify.app').replace(/\/+$/, '')
const STATE_SECRET = process.env.STATE_SECRET || process.env.LI_STATE_SECRET || 'dev-state-secret'

// for verifying the *frontend* Supabase access token without RS256 keys
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

const LI_AUTH  = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'

// ---------- tiny helpers ----------
function signState(obj) {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url')
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}
function verifyState(s) {
  const [payload, sig] = String(s || '').split('.')
  if (!payload || !sig) throw new Error('bad_state')
  const expect = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('base64url')
  if (sig !== expect) throw new Error('bad_state_sig')
  const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (Date.now() - Number(obj.t || 0) > 15 * 60 * 1000) throw new Error('state_expired')
  return obj
}
async function userIdFromFrontJWT(frontJwt) {
  if (!frontJwt) throw new Error('missing_front_jwt')
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('supabase_env_missing')
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${frontJwt}`, apikey: SUPABASE_ANON_KEY } })
  if (!r.ok) throw new Error(`auth_user_http_${r.status}`)
  const j = await r.json()
  return j?.id || j?.user?.id || null
}

// ---------- Step 1: start OAuth ----------
router.get('/login', async (req, res) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT) {
      const miss = [
        !CLIENT_ID     ? 'LINKEDIN_CLIENT_ID'     : null,
        !CLIENT_SECRET ? 'LINKEDIN_CLIENT_SECRET' : null,
        !REDIRECT      ? 'LINKEDIN_REDIRECT'      : null
      ].filter(Boolean).join(',')
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=missing_env_${encodeURIComponent(miss)}`)
    }

    // Accept either ?state=<supabaseAccessToken> OR ?token=<supabaseAccessToken>
    const frontToken = String(req.query.state || req.query.token || '')
    const uid = await userIdFromFrontJWT(frontToken)   // no RS256/JWKS; we ask Supabase /auth/v1/user
    if (!uid) throw new Error('no_uid_from_front')

    const st = signState({ uid, t: Date.now(), n: crypto.randomBytes(6).toString('hex') })

    const url = new URL(LI_AUTH)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT)
    url.searchParams.set('scope', 'openid profile email r_liteprofile r_emailaddress w_member_social')
    url.searchParams.set('state', st)

    return res.redirect(url.toString())
  } catch (e) {
    console.log('li_login_error', e.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(e.message)}`)
  }
})

// ---------- Step 2: OAuth callback ----------
router.get('/callback', async (req, res) => {
  const { code = '', state = '' } = req.query || {}
  try {
    if (!code) throw new Error('missing_code')
    const { uid } = verifyState(state)
    if (!uid) throw new Error('state_no_uid')

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: REDIRECT,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })

    const tr = await fetch(LI_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!tr.ok) {
      const text = await tr.text().catch(() => '')
      throw new Error(`token_http_${tr.status}:${text.slice(0, 200)}`)
    }
    const tok = await tr.json()
    const accessToken = tok?.access_token
    const expiresIn = Number(tok?.expires_in || 0)
    if (!accessToken) throw new Error('no_access_token')

    // optional userinfo (helps you bind the LinkedIn user)
    let liUserId = null
    try {
      const ui = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
      if (ui.ok) { const j = await ui.json(); liUserId = j?.sub ? String(j.sub) : null }
    } catch {}

    // persist token
    await supaAdmin.from('app_settings').upsert({
      user_id: uid,
      linkedin_access_token: accessToken,
      linkedin_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      linkedin_user_id: liUserId,
      updated_at: new Date().toISOString(),
      li_needs_seed: true        // flag for your seeder to run once
    }, { onConflict: 'user_id' })

    console.log('linkedin_callback_ok', uid)
    return res.redirect(`${APP_ORIGIN}/settings?ok=1&provider=linkedin`)
  } catch (e) {
    console.log('linkedin_callback_error', e.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(e.message)}`)
  }
})

export default router
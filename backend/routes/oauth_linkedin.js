import express from 'express'
import fetch from 'node-fetch'
import * as jose from 'jose'
import { supa, supaAdmin } from '../db.js'
import { enqueueDiscovery } from '../worker/on_connect_seeder.js'

const router = express.Router()

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET
const REDIRECT = (
  process.env.LINKEDIN_REDIRECT ||
  process.env.LI_REDIRECT ||
  `${process.env.API_BASE || 'https://empirerise.onrender.com'}/oauth/linkedin/callback`
)
const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || 'https://empirerise.netlify.app').replace(/\/+$/,'')
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/,'')
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL || (SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/keys` : null)

const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo'

async function userFromFrontToken(token) {
  // try RS256 verify first
  if (SUPABASE_JWKS_URL) {
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(SUPABASE_JWKS_URL))
      const { payload } = await jose.jwtVerify(token, JWKS, {})
      return { id: payload.sub || payload.user_id || null }
    } catch (e) {
      console.log('li_jwt_verify_failed_rs256', e.message)
    }
  }
  // fallback, ask Supabase to validate the token for us
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!r.ok) throw new Error(`auth_user_http_${r.status}`)
    const j = await r.json()
    return { id: j?.id || null }
  } catch (e) {
    console.log('li_auth_user_failed', e.message)
    return { id: null }
  }
}

router.get('/login', async (req, res) => {
  try {
    const token = String(req.query.state || req.query.token || '')
    const u = await userFromFrontToken(token)
    if (!u.id) {
      console.log('linkedin_login_error bad_front_token', token ? 'bad_front_token' : 'missing_front_token')
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=bad_front_token`)
    }
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=missing_client`)
    }

    const url = new URL(LI_AUTH)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT)
    // keep scopes minimal and allowed
    url.searchParams.set('scope', 'openid profile w_member_social')
    // pack a short HMAC state we do not need to verify at LinkedIn side
    const mini = await new jose.SignJWT({ s: u.id, t: 'li' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(process.env.STATE_SECRET || 'dev-state'))
    url.searchParams.set('state', mini)

    return res.redirect(url.toString())
  } catch (e) {
    console.log('linkedin_login_error', e.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=login_failed`)
  }
})

router.get('/callback', async (req, res) => {
  const { code = '', state = '' } = req.query || {}
  try {
    console.log('li_cb_url', req.originalUrl)
    if (!code) {
      if (req.query.error || req.query.error_description) {
        const msg = `${req.query.error} ${req.query.error_description || ''}`.trim()
        console.log('linkedin_callback_error_from_provider', msg)
      }
      throw new Error('missing_code')
    }

    let userId = null
    try {
      const { payload } = await jose.jwtVerify(
        String(state),
        new TextEncoder().encode(process.env.STATE_SECRET || 'dev-state')
      )
      userId = String(payload?.s || '')
    } catch {
      userId = null
    }
    if (!userId) throw new Error('state_user_missing')

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
      const text = await tr.text().catch(()=> '')
      throw new Error(`token_http_${tr.status}:${text.slice(0,200)}`)
    }
    const tokenJson = await tr.json()
    const accessToken = tokenJson?.access_token
    const expiresIn = Number(tokenJson?.expires_in || 0)
    if (!accessToken) throw new Error('no_access_token')

    // fetch userinfo to bind id
    const ui = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } })
    const userInfo = ui.ok ? await ui.json() : {}
    const liUserId = String(userInfo?.sub || '')

    // write token to app_settings
    const { error: upErr } = await supaAdmin
      .from('app_settings')
      .upsert({
        user_id: userId,
        linkedin_access_token: accessToken,
        linkedin_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        linkedin_user_id: liUserId || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
    if (upErr) throw upErr

    // enqueue a small discovery seed for this user
    enqueueDiscovery(userId).catch(()=>{})

    console.log('linkedin_callback_ok', userId)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=true`)
  } catch (e) {
    console.log('linkedin_callback_error', e.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(String(e.message || 'callback_failed'))}`)
  }
})

export default router
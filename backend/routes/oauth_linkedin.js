import express from 'express'
import fetch from 'node-fetch'
import * as jose from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || '').replace(/\/+$/,'')
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET
const REDIRECT = (
  process.env.LINKEDIN_REDIRECT ||
  process.env.LI_REDIRECT ||
  `${process.env.API_BASE || 'https://empirerise.onrender.com'}/oauth/linkedin/callback`
).replace(/\/+$/,'')
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL || ''
const OIDC_SCOPE = 'openid profile email w_member_social'

const LI_AUTH  = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo'

function b64url(str) {
  return Buffer.from(str).toString('base64url')
}
function b64urlDecode(str) {
  return Buffer.from(String(str || ''), 'base64url').toString('utf8')
}

async function supabaseUserIdFromFrontToken(frontJwt) {
  if (!frontJwt) return null
  try {
    // Best effort verify if JWKS is configured and token is RS256
    if (SUPABASE_JWKS_URL) {
      const JWKS = jose.createRemoteJWKSet(new URL(SUPABASE_JWKS_URL))
      const { payload } = await jose.jwtVerify(frontJwt, JWKS).catch(() => ({ payload: null }))
      if (payload?.sub) return String(payload.sub)
    }
  } catch {}
  // Fallback decode without verification
  try {
    const payload = jose.decodeJwt(frontJwt)
    if (payload?.sub) return String(payload.sub)
  } catch {}
  return null
}

// GET /oauth/linkedin/login?state=<front_access_token>
router.get('/login', async (req, res) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT || !APP_ORIGIN) {
      const miss = [
        !CLIENT_ID ? 'LINKEDIN_CLIENT_ID' : null,
        !CLIENT_SECRET ? 'LINKEDIN_CLIENT_SECRET' : null,
        !REDIRECT ? 'LINKEDIN_REDIRECT' : null,
        !APP_ORIGIN ? 'APP_ORIGIN' : null
      ].filter(Boolean).join(',')
      console.log('linkedin_login_error missing_env', miss)
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=missing_env_${encodeURIComponent(miss)}`)
    }

    const frontToken = String(req.query.state || req.query.token || '')
    if (!frontToken) {
      console.log('linkedin_login_error bad_front_token')
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=bad_front_token`)
    }

    const packed = b64url(JSON.stringify({ t: 'li', s: frontToken }))
    const url = new URL(LI_AUTH)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT)
    url.searchParams.set('scope', OIDC_SCOPE)
    url.searchParams.set('state', packed)

    return res.redirect(url.toString())
  } catch (e) {
    console.log('linkedin_login_error', e?.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=login_failed`)
  }
})

// GET /oauth/linkedin/callback
router.get('/callback', async (req, res) => {
  const { code = '', state = '', error = '', error_description = '' } = req.query || {}
  try {
    console.log('li_cb_url', req.originalUrl)

    if (error) {
      console.log('linkedin_callback_error_from_provider', error, error_description)
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(error)}`)
    }
    if (!code) throw new Error('missing_code')

    let frontToken = ''
    try {
      const parsed = JSON.parse(b64urlDecode(state))
      if (parsed?.t === 'li' && parsed?.s) frontToken = String(parsed.s)
    } catch {}
    const userId = await supabaseUserIdFromFrontToken(frontToken)
    if (!userId) throw new Error('user_not_identified')

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
      const txt = await tr.text().catch(() => '')
      throw new Error(`token_http_${tr.status}:${txt.slice(0,200)}`)
    }
    const tokenJson = await tr.json().catch(() => null)
    const accessToken = tokenJson?.access_token || ''
    const expiresIn = Number(tokenJson?.expires_in || 0)
    if (!accessToken) throw new Error('no_access_token')

    // OIDC userinfo to capture LinkedIn user id
    let liUserId = null
    try {
      const ui = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (ui.ok) {
        const userInfo = await ui.json().catch(() => ({}))
        liUserId = userInfo?.sub ? String(userInfo.sub) : null
      }
    } catch {}

    const { error: upErr } = await supaAdmin
      .from('app_settings')
      .upsert({
        user_id: userId,
        linkedin_access_token: accessToken,
        linkedin_user_id: liUserId,
        linkedin_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
    if (upErr) throw upErr

    console.log('linkedin_callback_ok', userId)

    // Close popup and ping opener
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.end(`
<!doctype html>
<title>LinkedIn connected</title>
<script>
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage({ provider:'linkedin', ok:true }, '*') } catch(e) {}
  }
  window.close()
</script>
Connected. You can close this window.
`)
  } catch (e) {
    console.log('linkedin_callback_error', e?.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(String(e?.message || 'callback_failed'))}`)
  }
})

export default router
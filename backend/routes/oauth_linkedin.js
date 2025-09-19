import express from 'express'
import fetch from 'node-fetch'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

// Env (keep your LINKEDIN_* names)
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET
const REDIRECT = (
  process.env.LINKEDIN_REDIRECT ||
  process.env.LI_REDIRECT ||
  'https://empirerise.onrender.com/oauth/linkedin/callback'
)
const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || 'https://empirerise.netlify.app').replace(/\/+$/,'')
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL

const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo'

// Verify Supabase JWT carried in state
const JWKS = SUPABASE_JWKS_URL ? createRemoteJWKSet(new URL(SUPABASE_JWKS_URL)) : null
async function userIdFromState(state) {
  if (!state) throw new Error('missing_state')
  if (!JWKS) throw new Error('jwks_not_configured')
  const { payload } = await jwtVerify(state, JWKS, { algorithms: ['RS256'] })
  return payload?.sub || payload?.user_id || null
}

// Start OAuth
router.get('/login', async (req, res) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT) {
      const miss = [
        !CLIENT_ID ? 'LINKEDIN_CLIENT_ID' : null,
        !CLIENT_SECRET ? 'LINKEDIN_CLIENT_SECRET' : null,
        !REDIRECT ? 'LINKEDIN_REDIRECT' : null
      ].filter(Boolean).join(',')
      console.log('linkedin_login_error missing_env', miss)
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=missing_env_${encodeURIComponent(miss)}`)
    }

    const state = String(req.query.state || '') || Math.random().toString(36).slice(2)
    const url = new URL(LI_AUTH)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT)
    url.searchParams.set('scope', 'openid profile email r_liteprofile r_emailaddress w_member_social')
    url.searchParams.set('state', state)
    return res.redirect(url.toString())
  } catch (e) {
    console.log('linkedin_login_error', e?.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=login_failed`)
  }
})

// OAuth callback
router.get('/callback', async (req, res) => {
  const { code = '', state = '' } = req.query || {}
  try {
    const userId = await userIdFromState(String(state))
    if (!userId) throw new Error('user_not_identified')

    // Exchange code for token
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

    // Fetch userinfo to bind LinkedIn account
    const ui = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!ui.ok) throw new Error(`userinfo_http_${ui.status}`)
    const userInfo = await ui.json().catch(()=> ({}))
    const liUserId = String(userInfo?.sub || '')

    // Save real token for this EmpireRise user
    await supaAdmin.from('app_settings').upsert({
      user_id: userId,
      linkedin_access_token: accessToken,
      linkedin_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      linkedin_user_id: liUserId || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

    console.log('linkedin_callback_ok', userId)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=true`)
  } catch (e) {
    console.log('linkedin_callback_error', e?.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(String(e?.message || 'callback_failed'))}`)
  }
})

export default router
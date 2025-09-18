import express from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import fetch from 'node-fetch'
import { supa } from '../db.js'

const router = express.Router()

const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
const CLIENT_ID = process.env.LI_CLIENT_ID
const CLIENT_SECRET = process.env.LI_CLIENT_SECRET
const REDIRECT = process.env.LI_REDIRECT || 'https://empirerise.onrender.com/oauth/linkedin/callback'
const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || '').replace(/\/+$/,'') || 'https://empirerise.netlify.app'

// verify Supabase JWT in the "state" parameter to get user_id
const JWKS_URL = process.env.SUPABASE_JWKS_URL
const JWKS = JWKS_URL ? createRemoteJWKSet(new URL(JWKS_URL)) : null
async function getUserIdFromState(state) {
  if (!state) throw new Error('missing_state')
  if (!JWKS) throw new Error('jwks_not_configured')
  const { payload } = await jwtVerify(state, JWKS, { algorithms: ['RS256'] })
  // sub is the user_id for Supabase JWTs
  return payload?.sub || payload?.user_id || null
}

// Step 1: redirect user to LinkedIn
router.get('/login', async (req, res) => {
  try {
    const state = String(req.query.state || '') || Math.random().toString(36).slice(2)
    const url = new URL(LI_AUTH)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT)
    // Keep scopes minimal for login + posting
    url.searchParams.set('scope', 'openid profile email r_liteprofile r_emailaddress w_member_social')
    url.searchParams.set('state', state)
    return res.redirect(url.toString())
  } catch (e) {
    console.log('linkedin_login_error', e?.message)
    return res.status(302).redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=login_failed`)
  }
})

// Step 2: LinkedIn redirects back here with ?code=&state=
router.get('/callback', async (req, res) => {
  const { code = '', state = '' } = req.query || {}
  try {
    // 1) identify user from state (Supabase JWT)
    const userId = await getUserIdFromState(String(state))
    if (!userId) throw new Error('user_not_identified')

    // 2) exchange code for access token
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
    if (!accessToken) throw new Error('no_access_token')

    // 3) upsert into app_settings keyed by user_id
    const { error: upErr } = await supa
      .from('app_settings')
      .upsert({ user_id: userId, linkedin_access_token: accessToken }, { onConflict: 'user_id' })
    if (upErr) throw upErr

    console.log('linkedin_callback_ok', userId)
    return res.status(302).redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=true`)
  } catch (e) {
    console.log('linkedin_callback_error', e?.message)
    return res.status(302).redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(String(e?.message || 'callback_failed'))}`)
  }
})

export default router
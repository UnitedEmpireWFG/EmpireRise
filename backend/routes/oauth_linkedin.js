// backend/routes/oauth_linkedin.js
// Uses LINKEDIN_* env vars to match your existing config.
// Drop-in replacement. No other files need renaming.

import express from 'express'
import fetch from 'node-fetch'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

// Env, using your naming. Fallbacks included to avoid future breakage.
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

// JWT verification for Supabase user from state
const JWKS = SUPABASE_JWKS_URL ? createRemoteJWKSet(new URL(SUPABASE_JWKS_URL)) : null
async function userIdFromState(state) {
  if (!state) throw new Error('missing_state')
  if (!JWKS) throw new Error('jwks_not_configured')
  const { payload } = await jwtVerify(state, JWKS, { algorithms: ['RS256'] })
  return payload?.sub || payload?.user_id || null
}

// Step 1: start OAuth
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
    // Keep scopes minimal but complete for your app
    url.searchParams.set('scope', 'openid profile email r_liteprofile r_emailaddress w_member_social')
    url.searchParams.set('state', state)
    return res.redirect(url.toString())
  } catch (e) {
    console.log('linkedin_login_error', e?.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=login_failed`)
  }
})

// Step 2: OAuth callback
router.get('/callback', async (req, res) => {
  const { code = '', state = '' } = req.query || {}
  try {
    const userId = await userIdFromState(String(state))
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
      const text = await tr.text().catch(()=> '')
      throw new Error(`token_http_${tr.status}:${text.slice(0,200)}`)
    }
    const tokenJson = await tr.json()
    const accessToken = tokenJson?.access_token
    if (!accessToken) throw new Error('no_access_token')

    const { error: upErr } = await supa
      .from('app_settings')
      .upsert({ user_id: userId, linkedin_access_token: accessToken }, { onConflict: 'user_id' })
    if (upErr) throw upErr

    console.log('linkedin_callback_ok', userId)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=true`)
  } catch (e) {
    console.log('linkedin_callback_error', e?.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(String(e?.message || 'callback_failed'))}`)
  }
})

export default router

/* Server mount reminder, already public in your server.js:
   app.use('/oauth/linkedin', oauthLinkedIn)
   Ensure it is BEFORE: app.use('/api', requireAuth)
*/
import express from 'express'
import fetch from 'node-fetch'
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

// Env
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET
const REDIRECT = process.env.LINKEDIN_REDIRECT || process.env.LI_REDIRECT || 'https://empirerise.onrender.com/oauth/linkedin/callback'
const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || 'https://empirerise.netlify.app').replace(/\/+$/,'')
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL
const STATE_SECRET = process.env.STATE_SECRET || process.env.JWT_SECRET || 'change-me'

// LinkedIn endpoints
const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo'

// Keys
const jwks = SUPABASE_JWKS_URL ? createRemoteJWKSet(new URL(SUPABASE_JWKS_URL)) : null
const stateKey = new TextEncoder().encode(STATE_SECRET)

// Helpers
async function userIdFromSupabaseJWT(jwt) {
  if (!jwt) throw new Error('missing_front_state')
  if (!jwks) throw new Error('jwks_not_configured')
  const { payload } = await jwtVerify(jwt, jwks, { algorithms: ['RS256'] })
  return payload?.sub || payload?.user_id || null
}
async function makeShortState(userId) {
  // short HS256 JWT, expires in 10 minutes
  return await new SignJWT({ sub: userId, purpose: 'li_oauth' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(stateKey)
}
async function userIdFromShortState(shortState) {
  const { payload } = await jwtVerify(shortState, stateKey, { algorithms: ['HS256'] })
  if (payload?.purpose !== 'li_oauth') throw new Error('bad_state_purpose')
  return payload?.sub || null
}

// STEP 1: start OAuth with short state
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

    // Frontend passes Supabase JWT in ?state=...
    const frontState = String(req.query.state || '')
    const userId = await userIdFromSupabaseJWT(frontState)
    if (!userId) throw new Error('user_not_identified')

    // Create compact state for LinkedIn (<< 255 chars)
    const shortState = await makeShortState(userId)

    const url = new URL(LI_AUTH)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT)
    url.searchParams.set('scope', 'openid profile email r_liteprofile r_emailaddress w_member_social')
    url.searchParams.set('state', shortState)
    return res.redirect(url.toString())
  } catch (e) {
    console.log('linkedin_login_error', e?.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(e?.message || 'login_failed')}`)
  }
})

// STEP 2: callback exchanges code and saves real token
router.get('/callback', async (req, res) => {
  const { code = '', state = '' } = req.query || {}
  try {
    const userId = await userIdFromShortState(String(state))
    if (!userId) throw new Error('user_not_identified')

    // Exchange code→token
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: REDIRECT,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
    const tr = await fetch(LI_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (!tr.ok) {
      const text = await tr.text().catch(()=> '')
      throw new Error(`token_http_${tr.status}:${text.slice(0,200)}`)
    }
    const tokenJson = await tr.json()
    const accessToken = tokenJson?.access_token
    const expiresIn = Number(tokenJson?.expires_in || 0)
    if (!accessToken) throw new Error('no_access_token')

    // Fetch user info to bind account
    const ui = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!ui.ok) throw new Error(`userinfo_http_${ui.status}`)
    const userInfo = await ui.json().catch(()=> ({}))
    const liUserId = String(userInfo?.sub || '')

    // Save token for this user
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
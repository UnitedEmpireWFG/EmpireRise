// backend/routes/oauth_linkedin.js
// Works with LINKEDIN_* or LI_* env names. Verifies Supabase JWT via JWKS,
// falls back to /auth/v1/user when JWKS fails. Saves token to app_settings.

import express from 'express'
import fetch from 'node-fetch'
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

// Env
const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET
const REDIRECT      = process.env.LINKEDIN_REDIRECT || process.env.LI_REDIRECT || 'https://empirerise.onrender.com/oauth/linkedin/callback'
const APP_ORIGIN    = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || 'https://empirerise.netlify.app').replace(/\/+$/,'')
const STATE_SECRET  = process.env.STATE_SECRET || 'change-me'
const SUPABASE_URL  = process.env.SUPABASE_URL || ''
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/,'')}/auth/v1/keys` : '')

// LinkedIn endpoints
const LI_AUTH     = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN    = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo'

// Keys
const stateKey = new TextEncoder().encode(STATE_SECRET)
const supaJWKS = SUPABASE_JWKS_URL ? createRemoteJWKSet(new URL(SUPABASE_JWKS_URL)) : null

// Helpers
async function userIdFromSupabaseJWT(token) {
  if (!token) throw new Error('missing_front_token')

  // Try JWKS verify
  if (supaJWKS) {
    try {
      const { payload } = await jwtVerify(token, supaJWKS, { algorithms: ['RS256'] })
      const uid = payload?.sub || payload?.user_id
      if (uid) return uid
    } catch (e) {
      console.log('li_jwt_verify_failed', String(e?.message || e))
    }
  } else {
    console.log('li_jwks_not_configured')
  }

  // Fallback to Supabase Auth user endpoint
  if (!SUPABASE_URL) throw new Error('jwks_and_supabase_unavailable')
  try {
    const r = await fetch(`${SUPABASE_URL.replace(/\/+$/,'')}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!r.ok) throw new Error(`auth_user_http_${r.status}`)
    const u = await r.json().catch(() => ({}))
    const uid = u?.id || u?.user?.id
    if (!uid) throw new Error('auth_user_no_id')
    return uid
  } catch (e) {
    console.log('li_auth_user_failed', String(e?.message || e))
    throw new Error('bad_front_token')
  }
}

async function makeShortState(userId) {
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

// Start OAuth. Frontend must send ?token= Supabase access token.
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

    const frontJWT = String(req.query.token || req.query.state || '')
    if (!frontJWT) {
      console.log('linkedin_login_error', 'no_front_token')
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=no_front_token`)
    }

    let userId
    try {
      userId = await userIdFromSupabaseJWT(frontJWT)
    } catch (e) {
      console.log('linkedin_login_error bad_front_token', e?.message)
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=bad_front_token`)
    }
    if (!userId) {
      console.log('linkedin_login_error', 'user_not_identified')
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=user_not_identified`)
    }

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

// Callback. Exchanges code for token and saves to app_settings.
router.get('/callback', async (req, res) => {
  const { code = '', state = '' } = req.query || {}
  try {
    const userId = await userIdFromShortState(String(state))
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
      const text = await tr.text().catch(() => '')
      throw new Error(`token_http_${tr.status}:${text.slice(0,200)}`)
    }
    const tokenJson = await tr.json()
    const accessToken = tokenJson?.access_token
    const expiresIn = Number(tokenJson?.expires_in || 0)
    if (!accessToken) throw new Error('no_access_token')

    // Optional, bind LinkedIn user id
    let liUserId = ''
    try {
      const ui = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (ui.ok) {
        const userInfo = await ui.json().catch(() => ({}))
        liUserId = String(userInfo?.sub || '')
      }
    } catch {}

    const { error: upErr } = await supaAdmin.from('app_settings').upsert({
      user_id: userId,
      linkedin_access_token: accessToken,
      linkedin_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      linkedin_user_id: liUserId || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    if (upErr) throw upErr

    console.log('linkedin_callback_ok', userId)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=true`)
  } catch (e) {
    console.log('linkedin_callback_error', e?.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(String(e?.message || 'callback_failed'))}`)
  }
})

export default router
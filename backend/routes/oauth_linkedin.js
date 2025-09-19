// backend/routes/oauth_linkedin.js
// Drop-in, fixes bad_front_token and writes with service role.
// Works with your existing FRONTEND which sends ?state=<supabase access_token>
// Uses LINKEDIN_* env names you already have.

import express from 'express'
import fetch from 'node-fetch'
import * as jose from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

// Env
const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || '').replace(/\/+$/,'')
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID || ''
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET || ''
const REDIRECT = (
  process.env.LINKEDIN_REDIRECT ||
  process.env.LI_REDIRECT ||
  `${process.env.API_BASE || 'https://empirerise.onrender.com'}/oauth/linkedin/callback`
).replace(/\/+$/,'')
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL || (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/+$/,'')}/auth/v1/keys` : '')
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '' // only for projects still using HS256
const STATE_SECRET = process.env.STATE_SECRET || '' // optional hardening, not required

// LinkedIn endpoints
const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo' // requires openid profile email scopes

function must(name, v) { if (!v) throw new Error(`env_missing:${name}`) }

// Verify the Supabase front-end JWT we receive in the state parameter.
// Supports RS256 via JWKS and HS256 via SUPABASE_JWT_SECRET.
async function getUserIdFromFrontJWT(jwt) {
  if (!jwt) throw new Error('missing_front_token')

  // Try RS256 first
  if (SUPABASE_JWKS_URL) {
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(SUPABASE_JWKS_URL))
      const { payload, protectedHeader } = await jose.jwtVerify(jwt, JWKS, { algorithms: ['RS256'] })
      if (!payload?.sub) throw new Error('no_sub')
      return String(payload.sub)
    } catch (e) {
      // fall through to HS256 path
    }
  }

  // HS256 fallback for older Supabase projects
  if (SUPABASE_JWT_SECRET) {
    const key = new TextEncoder().encode(SUPABASE_JWT_SECRET)
    const { payload } = await jose.jwtVerify(jwt, key, { algorithms: ['HS256'] })
    if (!payload?.sub) throw new Error('no_sub')
    return String(payload.sub)
  }

  throw new Error('jwt_verify_unavailable')
}

// Step 1: start OAuth
// GET /oauth/linkedin/login?state=<supabase_access_token>
// Legacy support: also accepts ?token=
router.get('/login', async (req, res) => {
  try {
    must('LINKEDIN_CLIENT_ID', CLIENT_ID)
    must('LINKEDIN_CLIENT_SECRET', CLIENT_SECRET)
    must('LINKEDIN_REDIRECT', REDIRECT)
    must('APP_ORIGIN', APP_ORIGIN)

    const stateJwt = String(req.query.state || req.query.token || '')
    if (!stateJwt) {
      console.log('linkedin_login_error missing_state_jwt')
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=missing_state`)
    }

    // Optional integrity wrapper around the frontend token
    let state = stateJwt
    if (STATE_SECRET) {
      const now = Math.floor(Date.now() / 1000)
      state = await new jose.SignJWT({ t: 'li_oauth', s: stateJwt })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(now)
        .setExpirationTime(now + 600)
        .sign(new TextEncoder().encode(STATE_SECRET))
    }

    const url = new URL(LI_AUTH)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT)
    // keep both classic and OIDC scopes so /userinfo works and posting remains allowed
    url.searchParams.set('scope', 'openid profile email r_liteprofile r_emailaddress w_member_social')
    url.searchParams.set('state', state)

    return res.redirect(url.toString())
  } catch (e) {
    console.log('linkedin_login_error', e?.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(e?.message || 'login_failed')}`)
  }
})

// Step 2: OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '')
    let state = String(req.query.state || '')
    if (!code) throw new Error('missing_code')

    // unwrap optional STATE_SECRET
    if (STATE_SECRET && state && state.split('.').length === 3) {
      try {
        const { payload } = await jose.jwtVerify(state, new TextEncoder().encode(STATE_SECRET), { algorithms: ['HS256'] })
        if (payload?.s) state = String(payload.s)
      } catch (e) {
        console.log('li_state_unwrap_failed', e?.message)
        // continue, will try to use state as-is
      }
    }

    // identify the EmpireRise user from the Supabase front token
    const userId = await getUserIdFromFrontJWT(state)
    if (!userId) throw new Error('user_not_identified')

    // exchange code for access token
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
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
      const t = await tr.text().catch(() => '')
      throw new Error(`token_http_${tr.status}:${t.slice(0,200)}`)
    }
    const tokenJson = await tr.json()
    const accessToken = tokenJson?.access_token
    const expiresIn = Number(tokenJson?.expires_in || 0)
    if (!accessToken) throw new Error('no_access_token')

    // fetch userinfo to bind LinkedIn user id
    let liUserId = null
    try {
      const ui = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (ui.ok) {
        const j = await ui.json()
        liUserId = j?.sub ? String(j.sub) : null
      }
    } catch {}

    // save to app_settings using service role
    const { error: upErr } = await supaAdmin
      .from('app_settings')
      .upsert({
        user_id: userId,
        linkedin_access_token: accessToken,
        linkedin_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        linkedin_user_id: liUserId
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
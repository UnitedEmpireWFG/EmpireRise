// backend/routes/oauth_linkedin.js
// Fixes: unauthorized_scope_error for r_emailaddress, popup going to settings,
// missing_code, and brittle scope handling.
//
// What changed
// 1) Scopes are now driven by LINKEDIN_SCOPES. Default is safe and does NOT
//    include r_emailaddress, which your app is not approved for.
//    Default: "openid profile email w_member_social"
//    If you later get approval for r_emailaddress or r_liteprofile, set:
//    LINKEDIN_SCOPES="openid profile email w_member_social r_emailaddress r_liteprofile"
// 2) State carries your Supabase access token, verified (RS256 or HS256).
// 3) Callback surfaces provider errors cleanly and upserts tokens with service role.

import express from 'express'
import fetch from 'node-fetch'
import * as jose from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

// ----- Env -----
const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || '').replace(/\/+$/,'')
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID || ''
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET || ''
// Must match LinkedIn allowlist exactly
const REDIRECT = process.env.LINKEDIN_REDIRECT || process.env.LI_REDIRECT || 'https://empirerise.onrender.com/oauth/linkedin/callback'

// Do NOT hardcode r_emailaddress; your app is not approved for it right now.
const SCOPES = (process.env.LINKEDIN_SCOPES || 'openid profile email w_member_social')
  .split(/[ ,]+/).filter(Boolean).join(' ')

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/,'')}/auth/v1/keys` : '')
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || ''   // HS256 fallback
const STATE_SECRET = process.env.STATE_SECRET || ''                 // optional integrity wrapper

// ----- LinkedIn endpoints -----
const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo'

// ----- Helpers -----
function must(name, v) { if (!v) throw new Error(`env_missing:${name}`) }

async function getUserIdFromFrontJWT(jwt) {
  if (!jwt) throw new Error('missing_front_token')
  // Prefer RS256 via JWKS
  if (SUPABASE_JWKS_URL) {
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(SUPABASE_JWKS_URL))
      const { payload } = await jose.jwtVerify(jwt, JWKS, { algorithms: ['RS256'] })
      if (!payload?.sub) throw new Error('no_sub')
      return String(payload.sub)
    } catch {}
  }
  // HS256 fallback
  if (SUPABASE_JWT_SECRET) {
    const key = new TextEncoder().encode(SUPABASE_JWT_SECRET)
    const { payload } = await jose.jwtVerify(jwt, key, { algorithms: ['HS256'] })
    if (!payload?.sub) throw new Error('no_sub')
    return String(payload.sub)
  }
  throw new Error('jwt_verify_unavailable')
}

async function wrapState(raw) {
  if (!STATE_SECRET) return raw
  const now = Math.floor(Date.now() / 1000)
  return await new jose.SignJWT({ s: raw, t: 'li' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(new TextEncoder().encode(STATE_SECRET))
}

async function unwrapState(wrapped) {
  if (!STATE_SECRET) return wrapped
  try {
    const { payload } = await jose.jwtVerify(
      wrapped,
      new TextEncoder().encode(STATE_SECRET),
      { algorithms: ['HS256'] }
    )
    return String(payload?.s || '')
  } catch {
    return wrapped
  }
}

// ----- Step 1: start OAuth -----
// FE calls: GET /oauth/linkedin/login?state=<supabase_access_token>
// We also accept ?token= for legacy.
router.get('/login', async (req, res) => {
  try {
    must('LINKEDIN_CLIENT_ID', CLIENT_ID)
    must('LINKEDIN_CLIENT_SECRET', CLIENT_SECRET)
    must('LINKEDIN_REDIRECT', REDIRECT)
    must('APP_ORIGIN', APP_ORIGIN)

    const frontJwt = String(req.query.state || req.query.token || '')
    if (!frontJwt) {
      console.log('linkedin_login_error missing_state')
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=missing_state`)
    }

    const state = await wrapState(frontJwt)

    const url = new URL(LI_AUTH)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT)
    url.searchParams.set('scope', SCOPES)
    url.searchParams.set('state', state)

    return res.redirect(url.toString())
  } catch (e) {
    console.log('linkedin_login_error', e?.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(e?.message || 'login_failed')}`)
  }
})

// ----- Step 2: OAuth callback -----
router.get('/callback', async (req, res) => {
  try {
    console.log('li_cb_url', req.originalUrl)

    // If LinkedIn returns an error, surface it instead of generic missing_code
    const providerErr = String(req.query.error || '')
    const providerDesc = String(req.query.error_description || '')
    if (providerErr) {
      console.log('linkedin_callback_error_from_provider', providerErr, providerDesc)
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(providerErr)}&desc=${encodeURIComponent(providerDesc)}`)
    }

    const code = String(req.query.code || '')
    if (!code) throw new Error('missing_code')

    let state = String(req.query.state || '')
    state = await unwrapState(state)

    const userId = await getUserIdFromFrontJWT(state)
    if (!userId) throw new Error('user_not_identified')

    // Exchange code → token
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

    // Bind LinkedIn id using OIDC /userinfo
    let liUserId = null
    try {
      const ui = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (ui.ok) {
        const j = await ui.json()
        liUserId = j?.sub ? String(j.sub) : null
      }
    } catch {}

    // Persist with service role
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
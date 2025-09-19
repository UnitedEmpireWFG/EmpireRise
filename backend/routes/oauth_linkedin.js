// backend/routes/oauth_linkedin.js
// Fixes: popup goes to settings, “Something went wrong”, missing_code.
// Key changes:
// • Do NOT mutate LINKEDIN_REDIRECT. Use exact value you whitelisted.
// • Accept state or token from the frontend, verify Supabase JWT (RS256 or HS256).
// • Log and surface LinkedIn error=… cases instead of throwing generic missing_code.
// • Upsert with supaAdmin so RLS does not block writes.

import express from 'express'
import fetch from 'node-fetch'
import * as jose from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

// Env
const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || '')
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID || ''
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET || ''
// IMPORTANT: do not trim or rewrite, must match LinkedIn allowlist exactly
const REDIRECT = process.env.LINKEDIN_REDIRECT || process.env.LI_REDIRECT || 'https://empirerise.onrender.com/oauth/linkedin/callback'

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/,'')}/auth/v1/keys` : '')
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || ''   // only for old HS256 projects
const STATE_SECRET = process.env.STATE_SECRET || ''                 // optional integrity wrapper

// LinkedIn endpoints
const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo'

// helpers
function must(name, v) { if (!v) throw new Error(`env_missing:${name}`) }

async function getUserIdFromFrontJWT(jwt) {
  if (!jwt) throw new Error('missing_front_token')
  // RS256 via JWKS
  if (SUPABASE_JWKS_URL) {
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(SUPABASE_JWKS_URL))
      const { payload } = await jose.jwtVerify(jwt, JWKS, { algorithms: ['RS256'] })
      if (!payload?.sub) throw new Error('no_sub')
      return String(payload.sub)
    } catch (e) {
      // fall through
    }
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

// Step 1: start OAuth
// Frontend calls: GET /oauth/linkedin/login?state=<supabase_access_token>
// Legacy also accepts ?token=
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
    // Keep OIDC for /userinfo and legacy scopes for posting
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
    // log full callback for diagnosis
    console.log('li_cb_url', req.originalUrl)

    const err = String(req.query.error || '')
    const errDesc = String(req.query.error_description || '')
    if (err) {
      console.log('linkedin_callback_error_from_provider', err, errDesc)
      return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(err)}&desc=${encodeURIComponent(errDesc)}`)
    }

    const code = String(req.query.code || '')
    if (!code) throw new Error('missing_code')

    let state = String(req.query.state || '')
    state = await unwrapState(state)

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

    // fetch userinfo to bind LinkedIn id
    let liUserId = null
    try {
      const ui = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (ui.ok) {
        const j = await ui.json()
        liUserId = j?.sub ? String(j.sub) : null
      }
    } catch {}

    // save using service-role
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
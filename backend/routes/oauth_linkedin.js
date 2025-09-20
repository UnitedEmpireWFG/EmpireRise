// backend/routes/oauth_linkedin.js
// Fix: jwt_verify_unavailable by adding a safe fallback to Supabase /auth/v1/user
// Also keeps scopes minimal by default to avoid LinkedIn scope errors

import express from 'express'
import fetch from 'node-fetch'
import * as jose from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

// Env
const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || '').replace(/\/+$/,'')
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID || ''
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET || ''
const REDIRECT = process.env.LINKEDIN_REDIRECT || process.env.LI_REDIRECT || 'https://empirerise.onrender.com/oauth/linkedin/callback'

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/,'')
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL || (SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/keys` : '')
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || ''
const STATE_SECRET = process.env.STATE_SECRET || ''

// LinkedIn endpoints
const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo'

// Scopes
// Default avoids r_emailaddress which your app is not approved for
const SCOPES = (process.env.LINKEDIN_SCOPES || 'openid profile email w_member_social')
  .split(/[ ,]+/).filter(Boolean).join(' ')

// Helpers
function must(name, v) { if (!v) throw new Error(`env_missing:${name}`) }

async function getUserIdFromFrontJWT(frontJwt) {
  if (!frontJwt) throw new Error('missing_front_token')

  // Try RS256
  if (SUPABASE_JWKS_URL) {
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(SUPABASE_JWKS_URL))
      const { payload } = await jose.jwtVerify(frontJwt, JWKS, { algorithms: ['RS256'] })
      const uid = payload?.sub || payload?.user_id
      if (uid) return String(uid)
    } catch (e) {
      console.log('li_jwt_verify_failed_rs256', String(e?.message || e))
    }
  }

  // Try HS256
  if (SUPABASE_JWT_SECRET) {
    try {
      const key = new TextEncoder().encode(SUPABASE_JWT_SECRET)
      const { payload } = await jose.jwtVerify(frontJwt, key, { algorithms: ['HS256'] })
      const uid = payload?.sub || payload?.user_id
      if (uid) return String(uid)
    } catch (e) {
      console.log('li_jwt_verify_failed_hs256', String(e?.message || e))
    }
  }

  // Final fallback, call Supabase to resolve the token to a user
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('jwt_verify_unavailable')
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${frontJwt}`, apikey: SUPABASE_ANON_KEY }
    })
    if (!r.ok) throw new Error(`auth_user_http_${r.status}`)
    const u = await r.json().catch(() => ({}))
    const uid = u?.id || u?.user?.id
    if (!uid) throw new Error('auth_user_no_id')
    return String(uid)
  } catch (e) {
    console.log('li_auth_user_failed', String(e?.message || e))
    throw new Error('bad_front_token')
  }
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

// Step 1
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

// Step 2
router.get('/callback', async (req, res) => {
  try {
    console.log('li_cb_url', req.originalUrl)

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

    let liUserId = null
    try {
      const ui = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (ui.ok) {
        const j = await ui.json()
        liUserId = j?.sub ? String(j.sub) : null
      }
    } catch {}

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
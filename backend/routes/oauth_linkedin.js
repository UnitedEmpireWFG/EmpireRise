// backend/routes/oauth_linkedin.js
import express from 'express'
import fetch from 'node-fetch'
import * as jose from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || '').replace(/\/+$/,'')
const LINKEDIN_CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET
const LINKEDIN_REDIRECT      = (process.env.LINKEDIN_REDIRECT || '').replace(/\/+$/, '')
const LINKEDIN_SCOPES        = (process.env.LINKEDIN_SCOPES || 'r_liteprofile r_emailaddress')
  .split(/[ ,]+/).filter(Boolean).join(' ')
const JWKS_URL = process.env.SUPABASE_JWKS_URL || (process.env.SUPABASE_URL
  ? `${process.env.SUPABASE_URL.replace(/\/+$/,'')}/auth/v1/keys` : null)

const AUTH_URL   = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL  = 'https://www.linkedin.com/oauth/v2/accessToken'
const ME_URL     = 'https://api.linkedin.com/v2/userinfo'
const EMAIL_URL  = 'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))'

function must(name, v) { if (!v) throw new Error(`env_missing:${name}`) }
async function verifySupabaseJWT(token) {
  if (!JWKS_URL) throw new Error('jwks_not_configured')
  const JWKS = jose.createRemoteJWKSet(new URL(JWKS_URL))
  const { payload } = await jose.jwtVerify(token, JWKS, { })
  return payload
}

// GET /oauth/linkedin/login?state=<supabase_access_token>
router.get('/login', (req, res) => {
  try {
    const { state = '' } = req.query
    must('LINKEDIN_CLIENT_ID', LINKEDIN_CLIENT_ID)
    must('LINKEDIN_REDIRECT', LINKEDIN_REDIRECT)

    const url = new URL(AUTH_URL)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', LINKEDIN_CLIENT_ID)
    url.searchParams.set('redirect_uri', LINKEDIN_REDIRECT)
    url.searchParams.set('scope', LINKEDIN_SCOPES)
    if (state) url.searchParams.set('state', state)

    return res.redirect(url.toString())
  } catch (e) {
    return res.redirect(`${APP_ORIGIN}/settings?error=${encodeURIComponent(e.message)}`)
  }
})

// GET /oauth/linkedin/callback?code=...&state=<supabase_access_token>
router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code
    if (!code) throw new Error('missing_code')

    must('LINKEDIN_CLIENT_ID', LINKEDIN_CLIENT_ID)
    must('LINKEDIN_CLIENT_SECRET', LINKEDIN_CLIENT_SECRET)
    must('LINKEDIN_REDIRECT', LINKEDIN_REDIRECT)

    const jwt = String(req.query.state || '')
    if (!jwt) throw new Error('missing_state_jwt')

    const supaPayload = await verifySupabaseJWT(jwt)
    const userId = supaPayload.sub || supaPayload.user_id
    if (!userId) throw new Error('no_user_in_token')

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: LINKEDIN_REDIRECT,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET
    })
    const tres = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!tres.ok) throw new Error(`token_http_${tres.status}`)
    const tok = await tres.json()
    if (!tok.access_token) throw new Error('no_access_token')

    const hdr = { Authorization: `Bearer ${tok.access_token}` }
    const meRes = await fetch(ME_URL, { headers: hdr })
    const me = meRes.ok ? await meRes.json() : {}
    const emRes = await fetch(EMAIL_URL, { headers: hdr })
    const email = emRes.ok ? await emRes.json() : {}

    await supaAdmin.from('app_settings').upsert({
      user_id: userId,
      linkedin_access_token: tok.access_token,
      linkedin_profile: me,
      linkedin_email: email,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=true`)
  } catch (e) {
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(e.message)}`)
  }
})

export default router
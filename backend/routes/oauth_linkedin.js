import express from 'express'
import fetch from 'node-fetch'
import crypto from 'crypto'
import { getUserFromStateToken } from '../lib/oauth_state.js'
import { upsertConnection } from '../services/connections.js'

const r = express.Router()
const APP = (process.env.ORIGIN_APP || '').replace(/\/+$/,'') || 'http://localhost:5173'

// ENV required:
// LINKEDIN_CLIENT_ID
// LINKEDIN_CLIENT_SECRET
// LINKEDIN_REDIRECT -> https://empirerise.onrender.com/oauth/linkedin/callback
// (Optional) LINKEDIN_SCOPES default: r_liteprofile r_emailaddress

const LI_ID     = process.env.LINKEDIN_CLIENT_ID
const LI_SECRET = process.env.LINKEDIN_CLIENT_SECRET
const LI_REDIRECT = (process.env.LINKEDIN_REDIRECT || '').replace(/\/+$/,'')
const LI_SCOPES = (process.env.LINKEDIN_SCOPES || 'r_liteprofile r_emailaddress').split(/\s+/).join(' ')
const LI_SCOPE_ENC = encodeURIComponent(LI_SCOPES)

function ensureEnv(res) {
  if (!LI_ID || !LI_SECRET || !LI_REDIRECT) {
    return res.redirect(`${APP}/settings?oauth=linkedin&ok=false&reason=missing_linkedin_env`)
  }
  return null
}

// PKCE (optional but recommended)
function genCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url')
}
function challenge(v) { return crypto.createHash('sha256').update(v).digest('base64url') }

// GET /oauth/linkedin/login?state=<supabase_access_token>
r.get('/login', async (req, res) => {
  if (ensureEnv(res)) return
  const st = String(req.query.state || '')
  if (!st) return res.redirect(`${APP}/settings?oauth=linkedin&ok=false&reason=missing_state`)

  const verifier = genCodeVerifier()
  const code_challenge = challenge(verifier)
  // store verifier in a short-lived cookie to read on callback
  res.cookie('li_verifier', verifier, { httpOnly:true, secure:true, sameSite:'lax', maxAge:5*60*1000 })

  const u = new URL('https://www.linkedin.com/oauth/v2/authorization')
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', LI_ID)
  u.searchParams.set('redirect_uri', LI_REDIRECT)
  u.searchParams.set('scope', LI_SCOPES)
  u.searchParams.set('state', st)
  u.searchParams.set('code_challenge', code_challenge)
  u.searchParams.set('code_challenge_method', 'S256')

  return res.redirect(u.toString())
})

// GET /oauth/linkedin/callback?code=...&state=...
r.get('/callback', async (req, res) => {
  try {
    if (ensureEnv(res)) return
    const code  = req.query.code
    const st    = req.query.state
    if (!code || !st) return res.redirect(`${APP}/settings?oauth=linkedin&ok=false&reason=missing_code_or_state`)

    const { user_id } = await getUserFromStateToken(st)
    const verifier = req.cookies?.li_verifier || null
    if (!verifier) return res.redirect(`${APP}/settings?oauth=linkedin&ok=false&reason=missing_verifier`)

    const body = new URLSearchParams()
    body.set('grant_type', 'authorization_code')
    body.set('code', code)
    body.set('redirect_uri', LI_REDIRECT)
    body.set('client_id', LI_ID)
    body.set('client_secret', LI_SECRET)
    body.set('code_verifier', verifier)

    const rTok = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!rTok.ok) throw new Error('linkedin_token_http_'+rTok.status)
    const tok = await rTok.json() // { access_token, expires_in }
    const expires_at = tok.expires_in ? new Date(Date.now() + tok.expires_in*1000).toISOString() : null

    await upsertConnection({
      user_id,
      platform: 'linkedin',
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || null,
      expires_at,
      scope: LI_SCOPES,
      meta: {}
    })

    return res.redirect(`${APP}/settings?connected=linkedin&ok=true`)
  } catch (e) {
    return res.redirect(`${APP}/settings?oauth=linkedin&ok=false&reason=${encodeURIComponent(e.message || 'error')}`)
  }
})

export default r
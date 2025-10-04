// backend/routes/oauth_linkedin.js
import express from 'express'
import fetch from 'node-fetch'
import { saveLinkedInToken, kickoffInitialSync } from '../drivers/driver_linkedin_smart.js'

const router = express.Router()

// Env
const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET
const REDIRECT      = (process.env.LINKEDIN_REDIRECT || '').replace(/\/+$/,'')
const SCOPES        = (process.env.LINKEDIN_SCOPES || 'r_liteprofile w_member_social')
  .split(/[ ,]+/).filter(Boolean).join(' ')
const APP_ORIGIN    = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || '').replace(/\/+$/,'')
const SUPA_URL      = (process.env.SUPABASE_URL || '').replace(/\/+$/,'')
const SUPA_ANON     = process.env.SUPABASE_ANON_KEY

const AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

function must(name, v) { if (!v) throw new Error(`env_missing:${name}`) }

// Resolve the Supabase user **from the front-end access token** safely via API.
// This avoids JWT algorithm/verification pitfalls.
async function supabaseUserFromFrontToken(frontToken) {
  if (!frontToken) throw new Error('bad_front_token')
  must('SUPABASE_URL', SUPA_URL)
  must('SUPABASE_ANON_KEY', SUPA_ANON)

  const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${frontToken}`,
      'apikey': SUPA_ANON
    }
  })
  if (!r.ok) throw new Error(`auth_user_http_${r.status}`)
  const j = await r.json()
  return { id: j?.id || j?.user?.id || null, email: j?.email || j?.user?.email || null }
}

// Step 1 — start OAuth
// Frontend calls:  GET /oauth/linkedin/login?state=<supabase_access_token>
// (we also accept ?token= for compatibility)
router.get('/login', async (req, res) => {
  try {
    must('LINKEDIN_CLIENT_ID', CLIENT_ID)
    must('LINKEDIN_CLIENT_SECRET', CLIENT_SECRET)
    must('LINKEDIN_REDIRECT', REDIRECT)

    const frontToken = String(req.query.state || req.query.token || '')
    if (!frontToken) return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=bad_front_token`)

    const url = new URL(AUTH_URL)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT)
    url.searchParams.set('scope', SCOPES)
    url.searchParams.set('state', frontToken) // round-trip so we can identify the user
    return res.redirect(url.toString())
  } catch (e) {
    console.log('linkedin_login_error', e.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=false&error=${encodeURIComponent(e.message)}`)
  }
})

// Step 2 — OAuth callback
router.get('/callback', async (req, res) => {
  const code  = String(req.query.code || '')
  const state = String(req.query.state || '') // this is the supabase access token we sent

  try {
    if (!code) throw new Error('missing_code')

    // identify the EmpireRise user by calling Supabase
    const u = await supabaseUserFromFrontToken(state)
    if (!u?.id) throw new Error('auth_user_missing')

    // exchange code → token
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })

    const tr = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!tr.ok) {
      const txt = await tr.text().catch(()=>'')
      throw new Error(`token_http_${tr.status}:${txt.slice(0,140)}`)
    }
    const tok = await tr.json() // { access_token, expires_in }
    const accessToken = tok?.access_token
    if (!accessToken) throw new Error('no_access_token')

    // (optional) try to get LI member id
    let liUserId = null
    try {
      const me = await fetch('https://api.linkedin.com/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (me.ok) {
        const mj = await me.json().catch(()=> ({}))
        liUserId = mj?.id ? String(mj.id) : null
      }
    } catch {}

    // persist token
    await saveLinkedInToken({
      userId: u.id,
      accessToken,
      expiresIn: Number(tok?.expires_in || 0),
      linkedinUserId: liUserId
    })

    // optionally kick off a first sync
    kickoffInitialSync(u.id).catch(()=>{})

    console.log('linkedin_callback_ok', u.id)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=1`)
  } catch (e) {
    console.log('linkedin_callback_error', e.message)
    return res.redirect(`${APP_ORIGIN}/settings?connected=linkedin&ok=0&error=${encodeURIComponent(e.message)}`)
  }
})

export default router
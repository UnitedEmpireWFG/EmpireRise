import express from 'express'
import fetch from 'node-fetch'
import { getUserFromStateToken } from '../lib/oauth_state.js'
import { upsertConnection } from '../services/connections.js'

const r = express.Router()
const APP = (process.env.ORIGIN_APP || '').replace(/\/+$/,'') || 'http://localhost:5173'

// ENV required:
// META_APP_ID
// META_APP_SECRET
// META_REDIRECT  -> https://empirerise.onrender.com/oauth/meta/callback
// (Optional) META_SCOPES, default: public_profile,email

const META_APP_ID     = process.env.META_APP_ID
const META_APP_SECRET = process.env.META_APP_SECRET
const META_REDIRECT   = (process.env.META_REDIRECT || '').replace(/\/+$/,'')
const META_SCOPES     = process.env.META_SCOPES || 'public_profile,email'

function ensureEnv(res) {
  if (!META_APP_ID || !META_APP_SECRET || !META_REDIRECT) {
    return res.redirect(`${APP}/settings?oauth=meta&ok=false&reason=missing_meta_env`)
  }
  return null
}

// GET /oauth/meta/login?platform=facebook|instagram&state=<supabase_access_token>
r.get('/login', async (req, res) => {
  if (ensureEnv(res)) return
  const platform = String(req.query.platform || '').toLowerCase()
  const state = String(req.query.state || '')
  if (!['facebook','instagram'].includes(platform)) {
    return res.redirect(`${APP}/settings?oauth=meta&ok=false&reason=bad_platform`)
  }
  if (!state) return res.redirect(`${APP}/settings?oauth=meta&ok=false&reason=missing_state`)

  const authURL = new URL('https://www.facebook.com/v19.0/dialog/oauth')
  authURL.searchParams.set('client_id', META_APP_ID)
  authURL.searchParams.set('redirect_uri', META_REDIRECT)
  authURL.searchParams.set('state', JSON.stringify({ st: state, p: platform }))
  // NOTE: for IG business features you’ll need extended scopes you’ve approved in your FB app
  authURL.searchParams.set('scope', META_SCOPES)

  return res.redirect(authURL.toString())
})

// GET /oauth/meta/callback?code=...&state=...
r.get('/callback', async (req, res) => {
  try {
    if (ensureEnv(res)) return
    const code  = req.query.code
    const state = req.query.state
    if (!code || !state) return res.redirect(`${APP}/settings?oauth=meta&ok=false&reason=missing_code_or_state`)

    let parsed
    try { parsed = JSON.parse(state) } catch { return res.redirect(`${APP}/settings?oauth=meta&ok=false&reason=bad_state`) }
    const { st, p } = parsed || {}
    if (!st || !['facebook','instagram'].includes(p)) {
      return res.redirect(`${APP}/settings?oauth=meta&ok=false&reason=bad_state_payload`)
    }

    const { user_id } = await getUserFromStateToken(st)

    // Exchange code for access token
    const tokenURL = new URL('https://graph.facebook.com/v19.0/oauth/access_token')
    tokenURL.searchParams.set('client_id', META_APP_ID)
    tokenURL.searchParams.set('client_secret', META_APP_SECRET)
    tokenURL.searchParams.set('redirect_uri', META_REDIRECT)
    tokenURL.searchParams.set('code', code)

    const rTok = await fetch(tokenURL.toString())
    if (!rTok.ok) throw new Error('meta_token_http_'+rTok.status)
    const tok = await rTok.json() // { access_token, token_type, expires_in }
    const expires_at = tok.expires_in ? new Date(Date.now() + tok.expires_in*1000).toISOString() : null

    await upsertConnection({
      user_id,
      platform: p,
      access_token: tok.access_token,
      refresh_token: null,
      expires_at,
      scope: META_SCOPES,
      meta: { token_type: tok.token_type || 'Bearer' }
    })

    return res.redirect(`${APP}/settings?connected=${p}&ok=true`)
  } catch (e) {
    return res.redirect(`${APP}/settings?oauth=meta&ok=false&reason=${encodeURIComponent(e.message || 'error')}`)
  }
})

export default r
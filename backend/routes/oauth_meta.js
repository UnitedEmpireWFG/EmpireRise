// backend/routes/oauth_meta.js
import express from 'express'
import fetch from 'node-fetch'
import * as jose from 'jose'
import { supaAdmin } from '../db.js'

const router = express.Router()

const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || '').replace(/\/+$/,'')
const META_APP_ID     = process.env.META_APP_ID
const META_APP_SECRET = process.env.META_APP_SECRET
const META_REDIRECT   = (process.env.META_REDIRECT || '').replace(/\/+$/, '')
const META_SCOPES     = (process.env.META_SCOPES || 'public_profile,email')
  .split(/[ ,]+/).filter(Boolean).join(',')
const JWKS_URL = process.env.SUPABASE_JWKS_URL || (process.env.SUPABASE_URL
  ? `${process.env.SUPABASE_URL.replace(/\/+$/,'')}/auth/v1/keys` : null)

const OAUTH_DIALOG = 'https://www.facebook.com/v20.0/dialog/oauth'
const TOKEN_URL    = 'https://graph.facebook.com/v20.0/oauth/access_token'
const PROFILE_URL  = 'https://graph.facebook.com/me?fields=id,name,email'

function must(name, v) { if (!v) throw new Error(`env_missing:${name}`) }
async function verifySupabaseJWT(token) {
  if (!JWKS_URL) throw new Error('jwks_not_configured')
  const JWKS = jose.createRemoteJWKSet(new URL(JWKS_URL))
  const { payload } = await jose.jwtVerify(token, JWKS, { })
  return payload
}

router.get('/login', (req, res) => {
  try {
    const { platform = 'facebook', state = '' } = req.query
    must('META_APP_ID', META_APP_ID)
    must('META_REDIRECT', META_REDIRECT)

    const url = new URL(OAUTH_DIALOG)
    url.searchParams.set('client_id', META_APP_ID)
    url.searchParams.set('redirect_uri', META_REDIRECT)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', META_SCOPES)
    if (state) url.searchParams.set('state', `${platform}:${state}`)

    return res.redirect(url.toString())
  } catch (e) {
    return res.redirect(`${APP_ORIGIN}/settings?error=${encodeURIComponent(e.message)}`)
  }
})

// GET /oauth/meta/callback?code=...&state=<platform:jwt>
router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code
    if (!code) throw new Error('missing_code')

    must('META_APP_ID', META_APP_ID)
    must('META_APP_SECRET', META_APP_SECRET)
    must('META_REDIRECT', META_REDIRECT)

    const rawState = String(req.query.state || '')
    const [platform = 'facebook', jwt = ''] = rawState.split(':')
    if (!jwt) throw new Error('missing_state_jwt')

    const supaPayload = await verifySupabaseJWT(jwt)
    const userId = supaPayload.sub || supaPayload.user_id
    if (!userId) throw new Error('no_user_in_token')

    const turl = new URL(TOKEN_URL)
    turl.searchParams.set('client_id', META_APP_ID)
    turl.searchParams.set('client_secret', META_APP_SECRET)
    turl.searchParams.set('redirect_uri', META_REDIRECT)
    turl.searchParams.set('code', code)

    const tres = await fetch(turl.toString())
    if (!tres.ok) throw new Error(`token_http_${tres.status}`)
    const tok = await tres.json()
    if (!tok.access_token) throw new Error('no_access_token')

    const pres = await fetch(`${PROFILE_URL}&access_token=${encodeURIComponent(tok.access_token)}`)
    const profile = pres.ok ? await pres.json() : {}

    await supaAdmin.from('app_settings').upsert({
      user_id: userId,
      meta_access_token: tok.access_token,
      meta_profile: profile,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

    return res.redirect(`${APP_ORIGIN}/settings?connected=meta&ok=true`)
  } catch (e) {
    return res.redirect(`${APP_ORIGIN}/settings?connected=meta&ok=false&error=${encodeURIComponent(e.message)}`)
  }
})

export default router
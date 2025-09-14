import express from 'express'
import crypto from 'crypto'

const router = express.Router()

const META_APP_ID = process.env.META_APP_ID
const META_APP_SECRET = process.env.META_APP_SECRET
const META_REDIRECT = (process.env.META_REDIRECT || '').trim() // e.g. https://empirerise.onrender.com/oauth/meta/callback
const META_SCOPES = (process.env.META_SCOPES || 'public_profile,email').split(/\s*,\s*| +/).filter(Boolean)

function enc(u) { return encodeURIComponent(u) }
function rand() { return crypto.randomBytes(16).toString('hex') }

/**
 * Start login
 * Example button/link in UI:  <a href="https://empirerise.onrender.com/oauth/meta/login">Connect Facebook/Instagram</a>
 */
router.get('/login', (req, res) => {
  if (!META_APP_ID || !META_REDIRECT) {
    return res.status(500).json({ ok: false, error: 'meta_env_missing' })
  }
  const state = rand()
  const redirect = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${enc(META_APP_ID)}&redirect_uri=${enc(META_REDIRECT)}&state=${enc(state)}&response_type=code&scope=${enc(META_SCOPES.join(','))}`

  console.log('[oauth/meta] redirect_uri ->', META_REDIRECT) // ← confirm this EXACT value is in Facebook: Valid OAuth Redirect URIs
  res.redirect(302, redirect)
})

/**
 * OAuth callback
 * NOTE: This assumes you already had token exchange logic; if not, wire it up to:
 *   GET https://graph.facebook.com/v21.0/oauth/access_token?
 *       client_id&redirect_uri&client_secret&code
 * and then store the access token against the user.
 */
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query
  if (error) {
    console.log('[oauth/meta] error', error, error_description)
    return res.status(400).send('Meta OAuth error: ' + error)
  }
  if (!code) return res.status(400).send('Missing code')

  try {
    // TODO: exchange and save token (use your existing logic if already implemented)
    // For now just bounce back to app settings after success
    return res.redirect((process.env.ORIGIN_APP || '') + '/settings')
  } catch (e) {
    console.log('[oauth/meta] callback error', e)
    return res.status(500).send('OAuth exchange failed')
  }
})

export default router
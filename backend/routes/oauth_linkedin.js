import express from 'express'
import crypto from 'crypto'

const router = express.Router()

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET
const LINKEDIN_REDIRECT = (process.env.LINKEDIN_REDIRECT || '').trim() // e.g. https://empirerise.onrender.com/oauth/linkedin/callback
const LINKEDIN_SCOPES = (process.env.LINKEDIN_SCOPES || 'r_liteprofile r_emailaddress').split(/\s*,\s*| +/).filter(Boolean)

function enc(u) { return encodeURIComponent(u) }
function rand() { return crypto.randomBytes(16).toString('hex') }

// Start login
router.get('/login', (req, res) => {
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_REDIRECT) {
    return res.status(500).json({ ok: false, error: 'linkedin_env_missing' })
  }
  const state = rand()
  const scope = LINKEDIN_SCOPES.join(' ')
  const redirect = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${enc(LINKEDIN_CLIENT_ID)}&redirect_uri=${enc(LINKEDIN_REDIRECT)}&state=${enc(state)}&scope=${enc(scope)}`

  console.log('[oauth/linkedin] redirect_uri ->', LINKEDIN_REDIRECT) // ← confirm this EXACT value is in LinkedIn: Authorized redirect URLs
  res.redirect(302, redirect)
})

// OAuth callback
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query
  if (error) {
    console.log('[oauth/linkedin] error', error, error_description)
    return res.status(400).send('LinkedIn OAuth error: ' + error)
  }
  if (!code) return res.status(400).send('Missing code')

  try {
    // TODO: exchange and save token (use your existing logic if already implemented)
    return res.redirect((process.env.ORIGIN_APP || '') + '/settings')
  } catch (e) {
    console.log('[oauth/linkedin] callback error', e)
    return res.status(500).send('OAuth exchange failed')
  }
})

export default router
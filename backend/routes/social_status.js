import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { supa, supaAdmin } from '../db.js'

const router = express.Router()
const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'
async function exists(p) { try { await fs.access(p); return true } catch { return false } }

// helpers
async function getAppSettingsAdmin(userId) {
  // admin client bypasses RLS so we see the fresh row written by the OAuth callback
  const { data, error } = await supaAdmin
    .from('app_settings')
    .select('linkedin_access_token, meta_access_token, instagram_access_token, updated_at')
    .eq('user_id', userId)
    .single()
  if (error) console.log('social_status_app_settings_error', error.message)
  return data || {}
}

async function getConnections(userId) {
  const { data } = await supa
    .from('connections')
    .select('provider, access_token')
    .eq('user_id', userId)
  return Array.isArray(data) ? data : []
}

async function getAccounts(userId) {
  const { data } = await supa
    .from('accounts')
    .select('provider, access_token, provider_account_id')
    .eq('user_id', userId)
  return Array.isArray(data) ? data : []
}

async function getAuthIdentities(userId) {
  try {
    const { data } = await supa.rpc('auth_get_identities_by_user', { uid: userId })
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

// main
router.get('/status', async (req, res) => {
  // never cache this endpoint
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('Surrogate-Control', 'no-store')

  const userId = req.user?.id || req.user?.sub || null
  if (!userId) return res.status(401).json({ ok:false, error:'unauthorized' })

  const payload = {
    ok: true,
    linkedin_oauth: false,
    linkedin_cookies: false,
    facebook: false,
    instagram: false,
    dbg: {
      user_id: userId,
      updated_at: null,
      from_settings: { linkedin: false, facebook: false, instagram: false },
      from_connections: { li: false, fb: false, ig: false },
      from_accounts: { li: false, fb: false, ig: false },
      from_identities: { li: false }
    }
  }

  try {
    // admin read guarantees we see the write immediately
    const s = await getAppSettingsAdmin(userId)
    const conns = await getConnections(userId)
    const accts = await getAccounts(userId)
    const ids = await getAuthIdentities(userId)

    const liCookiesPath = path.join(COOKIES_DIR, `${userId}.json`)
    const liCookies = await exists(liCookiesPath)

    // detect LinkedIn connection from any source
    const liFromSettings = Boolean(s?.linkedin_access_token)
    const liFromConns = conns.some(x => String(x.provider).toLowerCase().includes('linkedin'))
    const liFromAccts = accts.some(x => String(x.provider).toLowerCase().includes('linkedin'))
    const liFromIds = ids.some(x => String(x.provider).toLowerCase().includes('linkedin'))
    const linkedInConnected = liFromSettings || liFromConns || liFromAccts || liFromIds

    // detect Facebook and Instagram
    const fbFromSettings = Boolean(s?.meta_access_token)
    const fbFromConns = conns.some(x => String(x.provider).toLowerCase() === 'facebook')
    const fbFromAccts = accts.some(x => String(x.provider).toLowerCase() === 'facebook')
    const fbConnected = fbFromSettings || fbFromConns || fbFromAccts

    const igFromSettings = Boolean(s?.instagram_access_token)
    const igFromConns = conns.some(x => String(x.provider).toLowerCase().includes('instagram'))
    const igFromAccts = accts.some(x => String(x.provider).toLowerCase().includes('instagram'))
    const igConnected = igFromSettings || igFromConns || igFromAccts

    payload.linkedin_oauth = linkedInConnected
    payload.linkedin_cookies = liCookies
    payload.facebook = fbConnected
    payload.instagram = igConnected
    payload.dbg = {
      user_id: userId,
      updated_at: s?.updated_at || null,
      from_settings: { linkedin: liFromSettings, facebook: fbFromSettings, instagram: igFromSettings },
      from_connections: { li: liFromConns, fb: fbFromConns, ig: igFromConns },
      from_accounts: { li: liFromAccts, fb: fbFromAccts, ig: igFromAccts },
      from_identities: { li: liFromIds }
    }
  } catch (e) {
    console.error('social_status_error', {
      userId,
      message: e?.message,
      code: e?.code,
      stack: e?.stack
    })
  }

  console.log('social_status_payload', JSON.stringify({
    uid: userId,
    li: payload.linkedin_oauth,
    fb: payload.facebook,
    ig: payload.instagram,
    dbg: payload.dbg
  }))

  return res.json(payload)
})

export default router

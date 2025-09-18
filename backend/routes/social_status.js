import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { supa } from '../db.js'

const router = express.Router()
const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'
async function exists(p) { try { await fs.access(p); return true } catch { return false } }

// helpers
async function getAppSettings(userId) {
  const { data } = await supa
    .from('app_settings')
    .select('linkedin_access_token, meta_access_token, instagram_access_token')
    .eq('user_id', userId).single()
  return data || {}
}

async function getConnections(userId) {
  // if you use a custom table like connections, accounts, providers
  const { data } = await supa
    .from('connections')
    .select('provider, access_token')
    .eq('user_id', userId)
  return Array.isArray(data) ? data : []
}

async function getAccounts(userId) {
  // common alternative table name
  const { data } = await supa
    .from('accounts')
    .select('provider, access_token, provider_account_id')
    .eq('user_id', userId)
  return Array.isArray(data) ? data : []
}

async function getAuthIdentities(userId) {
  // if your server has service role, you can read auth schema
  try {
    const { data } = await supa.rpc('auth_get_identities_by_user', { uid: userId })
    // if you do not have this RPC, this will fail silently and we ignore
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

// main
router.get('/status', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub || null
    if (!userId) return res.status(401).json({ ok:false, error:'unauthorized' })

    const s = await getAppSettings(userId)
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

    // detect Facebook and Instagram from multiple sources
    const fbFromSettings = Boolean(s?.meta_access_token)
    const fbFromConns = conns.some(x => String(x.provider).toLowerCase() === 'facebook')
    const fbFromAccts = accts.some(x => String(x.provider).toLowerCase() === 'facebook')
    const fbConnected = fbFromSettings || fbFromConns || fbFromAccts

    const igFromSettings = Boolean(s?.instagram_access_token)
    const igFromConns = conns.some(x => String(x.provider).toLowerCase().includes('instagram'))
    const igFromAccts = accts.some(x => String(x.provider).toLowerCase().includes('instagram'))
    const igConnected = igFromSettings || igFromConns || igFromAccts

    return res.json({
      ok: true,
      linkedin_oauth: linkedInConnected,
      linkedin_cookies: liCookies,
      facebook: fbConnected,
      instagram: igConnected,
      dbg: {
        from_settings: { linkedin: liFromSettings, facebook: fbFromSettings, instagram: igFromSettings },
        from_connections: { li: liFromConns, fb: fbFromConns, ig: igFromConns },
        from_accounts: { li: liFromAccts, fb: fbFromAccts, ig: igFromAccts },
        from_identities: { li: liFromIds }
      }
    })
  } catch (e) {
    return res.status(200).json({ ok:false, error:String(e?.message || e) })
  }
})

export default router

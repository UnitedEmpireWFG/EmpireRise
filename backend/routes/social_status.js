import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { supa } from '../db.js'

const router = express.Router()
const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'
async function exists(p) { try { await fs.access(p); return true } catch { return false } }

async function getAppSettings(userId) {
  const { data, error } = await supa
    .from('app_settings')
    .select('linkedin_access_token, meta_access_token, instagram_access_token, updated_at')
    .eq('user_id', userId).single()
  if (error) console.log('social_status_app_settings_error', error.message)
  return data || {}
}

router.get('/status', async (req, res) => {
  try {
    // never cache this
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.setHeader('Surrogate-Control', 'no-store')

    const userId = req.user?.id || req.user?.sub || null
    if (!userId) return res.status(401).json({ ok:false, error:'unauthorized' })

    const s = await getAppSettings(userId)
    const liCookies = await exists(path.join(COOKIES_DIR, `${userId}.json`))
    const linkedInConnected = Boolean(s?.linkedin_access_token)
    const payload = {
      ok: true,
      linkedin_oauth: linkedInConnected,
      linkedin_cookies: liCookies,
      facebook: Boolean(s?.meta_access_token),
      instagram: Boolean(s?.instagram_access_token),
      dbg: { user_id: userId, updated_at: s?.updated_at || null, from_settings: { linkedin: linkedInConnected } }
    }
    console.log('social_status_payload', JSON.stringify(payload.dbg))
    return res.json(payload)
  } catch (e) {
    return res.status(200).json({ ok:false, error:String(e?.message || e) })
  }
})

export default router
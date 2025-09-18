import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { supa } from '../db.js'

const router = express.Router()
const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'

async function fileExists(p) {
  try { await fs.access(p); return true } catch { return false }
}

router.get('/status', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub || null
    if (!userId) return res.status(401).json({ ok:false, error:'unauthorized' })

    const { data: row } = await supa
      .from('app_settings')
      .select('linkedin_access_token, meta_access_token, instagram_access_token')
      .eq('user_id', userId)
      .single()

    const liOauth = Boolean(row?.linkedin_access_token)
    const fbOauth = Boolean(row?.meta_access_token)
    const igOauth = Boolean(row?.instagram_access_token)

    const liCookiesPath = path.join(COOKIES_DIR, `${userId}.json`)
    const liCookies = await fileExists(liCookiesPath)

    return res.json({
      ok: true,
      linkedin_oauth: liOauth,
      linkedin_cookies: liCookies,
      facebook: fbOauth,
      instagram: igOauth
    })
  } catch (e) {
    return res.status(200).json({ ok:false, error:String(e?.message || e) })
  }
})

export default router
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'

const router = express.Router()
const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'

router.post('/upload-cookies', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const body = req.body
    if (!body || !Array.isArray(body)) return res.status(400).json({ ok: false, error: 'invalid format' })

    await fs.mkdir(COOKIES_DIR, { recursive: true })
    const filePath = path.join(COOKIES_DIR, `${userId}.json`)
    await fs.writeFile(filePath, JSON.stringify(body, null, 2))
    console.log('linkedin_cookies_saved', userId)

    return res.json({ ok: true })
  } catch (e) {
    console.error('upload_cookies_error', e)
    return res.status(500).json({ ok: false, error: e.message })
  }
})

export default router

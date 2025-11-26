// backend/routes/linkedin_cookies_upload.js
import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { getLinkedInCookiePath } from '../utils/linkedin_cookies.js'

const router = express.Router()

async function saveLinkedInCookiesToDisk(userId, cookies) {
  const filePath = getLinkedInCookiePath(userId)
  const dir = path.dirname(filePath)

  await fs.promises.mkdir(dir, { recursive: true })

  const tmpPath = `${filePath}.tmp`
  await fs.promises.writeFile(
    tmpPath,
    JSON.stringify(cookies, null, 2),
    'utf8'
  )
  await fs.promises.rename(tmpPath, filePath)

  console.log('li_cookies_stored', {
    userId,
    cookies_length: Array.isArray(cookies) ? cookies.length : 0,
    filePath,
  })
}

// Multer in-memory (we only accept one JSON file)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2_000_000 } })

// Health
router.get('/', (_req, res) => res.json({ ok: true, msg: 'cookies_upload_ready' }))

// Upload endpoint — expects form-data field: file (application/json)
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub || null
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    let cookies = []

    if (req.file?.buffer) {
      try { cookies = JSON.parse(req.file.buffer.toString('utf-8')) }
      catch { return res.status(400).json({ ok: false, error: 'invalid_json' }) }
    } else if (Array.isArray(req.body)) {
      cookies = req.body
    } else if (Array.isArray(req.body?.cookies)) {
      cookies = req.body.cookies
    }

    if (!Array.isArray(cookies)) {
      return res.status(400).json({ ok: false, error: 'expected_array_of_cookies' })
    }

    const ok = cookies.every(c => typeof c?.name === 'string' && typeof c?.value === 'string')
    if (!ok) {
      return res.status(400).json({ ok: false, error: 'cookies_missing_name_or_value' })
    }

    // normalize domains — ensure .linkedin.com default
    const normalized = cookies.map(c => ({
      ...c,
      domain: c.domain?.startsWith('.') ? c.domain : (c.domain || '.linkedin.com')
    }))

    const hasAuthCookie = normalized.some(c => c.name === 'li_at' || c.name === 'li_rm')
    if (!hasAuthCookie) {
      console.log('li_cookies_missing_auth', {
        userId,
        cookieCount: normalized.length,
        cookieNames: normalized.map(c => c.name)
      })
      return res.status(400).json({ ok: false, error: 'linkedin_auth_cookies_missing' })
    }

    try {
      await saveLinkedInCookiesToDisk(userId, normalized)
    } catch (err) {
      console.error('li_cookies_store_result', { userId, result: 'error', error: err?.message })
      return res.status(500).json({ ok: false, error: 'failed_to_save_cookies' })
    }

    const savedPath = getLinkedInCookiePath(userId)

    console.log('li_cookies_store_result', { userId, result: 'saved_to_disk', path: savedPath })

    return res.json({ ok: true, saved: savedPath })
  } catch (e) {
    console.error('li_cookies_store_error', { message: e?.message, stack: e?.stack })
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

export default router

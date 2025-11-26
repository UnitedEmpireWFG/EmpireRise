// backend/routes/linkedin_cookies_upload.js
import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// Where we store cookies on the API host
const BASE_DIR = '/opt/render/project/.data/li_cookies'

async function saveLinkedInCookiesToDisk(userId, cookies) {
  const dir = BASE_DIR
  const filePath = path.join(dir, `${userId}.json`)

  await fs.promises.mkdir(dir, { recursive: true })

  await fs.promises.writeFile(
    filePath,
    JSON.stringify(cookies, null, 2),
    'utf8'
  )

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

    // validate file present
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, error: 'missing_file' })
    }

    // validate JSON array of cookies with name+value
    let json
    try { json = JSON.parse(req.file.buffer.toString('utf-8')) }
    catch { return res.status(400).json({ ok: false, error: 'invalid_json' }) }

    if (!Array.isArray(json)) {
      return res.status(400).json({ ok: false, error: 'expected_array_of_cookies' })
    }
    const ok = json.every(c => typeof c?.name === 'string' && typeof c?.value === 'string')
    if (!ok) {
      return res.status(400).json({ ok: false, error: 'cookies_missing_name_or_value' })
    }

    // normalize domains — ensure .linkedin.com default
    const normalized = json.map(c => ({
      ...c,
      domain: c.domain?.startsWith('.') ? c.domain : (c.domain || '.linkedin.com')
    }))

    await saveLinkedInCookiesToDisk(userId, normalized)

    const savedPath = path.join(BASE_DIR, `${userId}.json`)

    console.log('li_cookies_store_result', { userId, result: 'saved_to_disk', path: savedPath })

    return res.json({ ok: true, saved: savedPath })
  } catch (e) {
    console.error('li_cookies_store_error', { message: e?.message, stack: e?.stack })
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

export default router

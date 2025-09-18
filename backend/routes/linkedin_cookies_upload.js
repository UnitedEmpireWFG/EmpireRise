import express from 'express'
import multer from 'multer'
import fs from 'node:fs/promises'
import path from 'node:path'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 } })
const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'

router.post('/upload', upload.single('cookies'), async (req, res) => {
  try {
    const user = req.user
    if (!user?.id) return res.status(401).json({ ok:false, error:'unauthorized' })
    if (!req.file?.buffer) return res.status(400).json({ ok:false, error:'no_file' })

    let arr
    try { arr = JSON.parse(req.file.buffer.toString('utf8')) }
    catch { return res.status(400).json({ ok:false, error:'invalid_json' }) }
    if (!Array.isArray(arr)) return res.status(400).json({ ok:false, error:'invalid_format' })

    await fs.mkdir(COOKIES_DIR, { recursive: true })
    const out = path.join(COOKIES_DIR, `${user.id}.json`)
    await fs.writeFile(out, JSON.stringify(arr), 'utf8')

    return res.json({ ok:true })
  } catch (e) {
    return res.status(200).json({ ok:false, error:String(e?.message || e) })
  }
})

export default router
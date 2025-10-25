// backend/routes/smart_admin.js
import { Router } from 'express'
import { runSmartDriverOnce } from '../worker/smart_driver.js'

const router = Router()

router.post('/run', async (req, res) => {
  try {
    const totals = await runSmartDriverOnce()
    res.json({ ok: true, ...totals })
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message })
  }
})

router.get('/ping', (_req, res) => res.json({ ok: true, t: Date.now() }))

export default router

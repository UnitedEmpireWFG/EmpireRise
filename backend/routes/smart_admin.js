// backend/routes/smart_admin.js
import { Router } from 'express'
import { runSmartDriverOnce } from '../worker/smart_driver.js'

const router = Router()

async function runOnce(res) {
  const totals = await runSmartDriverOnce()
  return res.json({ ok: true, ...totals })
}

router.post('/run', async (_req, res) => {
  try {
    await runOnce(res)
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message })
  }
})

router.post('/kick', async (_req, res) => {
  try {
    await runOnce(res)
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message })
  }
})

router.get('/ping', (_req, res) => res.json({ ok: true, t: Date.now() }))

export default router

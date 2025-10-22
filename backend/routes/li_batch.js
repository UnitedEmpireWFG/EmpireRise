// backend/routes/li_batch.js
import { Router } from 'express'
import { supa } from '../db.js'

const router = Router()

router.get('/api/li/batch/prefs', async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id || null
    if (!userId) return res.json({})
    const { data, error } = await supa
      .from('li_batch_prefs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    res.json(data || {})
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message })
  }
})

router.post('/api/li/batch/prefs', async (req, res) => {
  try {
    const {
      user_id,
      is_enabled = false,
      daily_quota = 25,
      schedule_cron = '0 9 * * *',
      timezone = 'America/Toronto',
      mode = 'push'
    } = req.body || {}
    if (!user_id) return res.status(400).json({ ok:false, error: 'missing user_id' })

    const { data, error } = await supa
      .from('li_batch_prefs')
      .upsert({
        user_id, is_enabled, daily_quota, schedule_cron, timezone, mode,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select('*')
      .maybeSingle()

    if (error) throw new Error(error.message)
    res.json(data)
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message })
  }
})

export default router
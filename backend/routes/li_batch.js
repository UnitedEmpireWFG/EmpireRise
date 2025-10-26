// backend/routes/li_batch.js
import express from 'express'
import { supa } from '../db.js'

const router = express.Router()

// GET /api/batch/prefs
router.get('/prefs', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub
    if (!userId) return res.status(401).json({ ok:false, error:'unauthorized' })

    const { data, error } = await supa
      .from('li_batch_prefs')
      .select('*')
      .eq('user_id', userId)
      .single()

    // PostgREST returns PGRST116 when not found; treat as empty
    if (error && error.code !== 'PGRST116') {
      console.log('li_batch_prefs_get_error', error.message)
    }

    return res.json(
      data || {
        user_id: userId,
        is_enabled: false,
        daily_quota: 25,
        schedule_cron: '0 10 * * *',
        timezone: 'America/Toronto',
        mode: 'push'
      }
    )
  } catch (e) {
    return res.status(200).json({ ok:false, error:String(e?.message || e) })
  }
})

// POST /api/batch/prefs
router.post('/prefs', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub || req.body?.user_id
    if (!userId) return res.status(401).json({ ok:false, error:'unauthorized' })

    const row = {
      user_id: userId,
      is_enabled: Boolean(req.body?.is_enabled),
      daily_quota: Number(req.body?.daily_quota) || 25,
      schedule_cron: req.body?.schedule_cron || '0 10 * * *',
      timezone: req.body?.timezone || 'America/Toronto',
      mode: req.body?.mode || 'push',
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supa
      .from('li_batch_prefs')
      .upsert(row, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) return res.status(200).json({ ok:false, error:error.message })
    return res.json({ ok:true, prefs:data })
  } catch (e) {
    return res.status(200).json({ ok:false, error:String(e?.message || e) })
  }
})

// POST /api/batch/run — manual kick to your batch/driver
router.post('/run', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub
    if (!userId) return res.status(401).json({ ok:false, error:'unauthorized' })
    // For now just log; your scheduler/driver can poll this if you want
    await supa.from('connect_log').insert({
      user_id: userId, event: 'manual_li_batch_kick', meta: {}
    })
    return res.json({ ok:true, enqueued:true })
  } catch (e) {
    return res.status(200).json({ ok:false, error:String(e?.message || e) })
  }
})

export default router
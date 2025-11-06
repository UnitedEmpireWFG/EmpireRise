import express from 'express'
import { supa } from '../db.js'

const router = express.Router()

function getUserId(req) {
  return req.user?.id || req.user?.user_id || req.user?.sub || null
}

router.post('/connect', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const items = Array.isArray(req.body?.items) ? req.body.items : []
    if (!items.length) return res.status(400).json({ ok: false, error: 'no_items' })

    const now = new Date()
    const rows = items.map(x => ({
      user_id: userId,
      platform: x.platform || 'linkedin',
      handle: x.handle || null,
      profile_url: x.profile_url || null,
      note: x.note || null,
      status: 'queued',
      scheduled_at: x.scheduled_at || now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    }))

    const { error } = await supa.from('connect_queue').insert(rows)
    if (error) throw error

    res.json({ ok: true, inserted: rows.length })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

router.get('/connect', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const { data, error } = await supa
      .from('connect_queue')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    res.json({ ok: true, items: data || [] })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

router.post('/connect/:id/cancel', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const { id } = req.params
    const { error } = await supa
      .from('connect_queue')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) throw error

    res.json({ ok: true })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

export default router

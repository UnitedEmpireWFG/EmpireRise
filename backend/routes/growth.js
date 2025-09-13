import express from 'express'
import { supa } from '../db.js'

const r = express.Router()

r.post('/api/growth/connect', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  if (!items.length) return res.json({ ok: false, error: 'no_items' })
  const rows = items.map(x => ({
    platform: x.platform || 'linkedin',
    handle: x.handle || null,
    profile_url: x.profile_url || null,
    note: x.note || null,
    status: 'queued',
    scheduled_at: new Date().toISOString()
  }))
  const { error } = await supa.from('connect_queue').insert(rows)
  res.json({ ok: !error, inserted: rows.length, error: error?.message })
})

r.get('/api/growth/connect', async (_req, res) => {
  const { data, error } = await supa
    .from('connect_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  res.json({ ok: !error, items: data || [], error: error?.message })
})

r.post('/api/growth/connect/:id/cancel', async (req, res) => {
  const { id } = req.params
  const { error } = await supa.from('connect_queue').update({ status: 'canceled' }).eq('id', id)
  res.json({ ok: !error, error: error?.message })
})

export default r

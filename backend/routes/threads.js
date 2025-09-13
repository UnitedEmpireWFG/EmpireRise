import express from 'express'
import { supa } from '../db.js'

const r = express.Router()

function computePriority(contact) {
  const replies = Number(contact?.replies || 0)
  const engagements = Number(contact?.engagement_count || 0)
  const freshness = 30
  return Math.max(0, Math.min(100, replies*20 + engagements*5 + freshness))
}

r.get('/api/threads', async (_req, res) => {
  const { data, error } = await supa
    .from('conv_threads')
    .select('*')
    .order('last_event_at', { ascending: false })
    .limit(200)
  res.json({ ok: !error, items: data || [], error: error?.message })
})

r.post('/api/threads', async (req, res) => {
  const b = req.body || {}
  const row = {
    contact_id: b.contact_id || null,
    platform: b.platform || 'linkedin',
    persona: b.persona || 'client',
    state: b.state || 'intro',
    priority: computePriority(b.contact || {})
  }
  const { data, error } = await supa.from('conv_threads').insert(row).select().maybeSingle()
  res.json({ ok: !error, item: data, error: error?.message })
})

r.get('/api/threads/:id/messages', async (req, res) => {
  const { id } = req.params
  const { data, error } = await supa
    .from('conv_messages')
    .select('*')
    .eq('thread_id', id)
    .order('created_at', { ascending: true })
    .limit(50)
  res.json({ ok: !error, items: data || [], error: error?.message })
})

r.post('/api/threads/:id/messages', async (req, res) => {
  const { id } = req.params
  const b = req.body || {}
  const msg = {
    thread_id: id,
    role: b.role || 'assistant',
    text: b.text || '',
    sentiment: b.sentiment || null,
    meta: b.meta || null
  }
  const { error } = await supa.from('conv_messages').insert(msg)
  if (!error) {
    await supa.from('conv_threads').update({ last_event_at: new Date().toISOString() }).eq('id', id)
  }
  res.json({ ok: !error, error: error?.message })
})

r.patch('/api/threads/:id', async (req, res) => {
  const { id } = req.params
  const fields = {}
  if (req.body?.state) fields.state = req.body.state
  if (req.body?.sentiment) fields.sentiment = req.body.sentiment
  if (Object.keys(fields).length === 0) return res.json({ ok: true })
  const { error } = await supa.from('conv_threads').update(fields).eq('id', id)
  res.json({ ok: !error, error: error?.message })
})

export default r

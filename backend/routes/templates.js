import express from 'express'
import { supa } from '../db.js'

const t = express.Router()

t.get('/api/templates', async (_req, res) => {
  const { data, error } = await supa
    .from('msg_templates')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
  res.json({ ok: !error, items: data || [], error: error?.message })
})

t.post('/api/templates', async (req, res) => {
  const body = req.body || {}
  const { error } = await supa.from('msg_templates').insert({
    name: body.name,
    platform: body.platform,
    persona: body.persona,
    body: body.body
  })
  res.json({ ok: !error, error: error?.message })
})

t.post('/api/templates/:id/variant', async (req, res) => {
  const { id } = req.params
  const { body } = req
  const { error } = await supa.from('msg_variants').insert({
    template_id: id,
    body: body?.body
  })
  res.json({ ok: !error, error: error?.message })
})

export default t

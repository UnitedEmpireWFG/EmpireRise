import express from 'express'
import { supa } from '../db.js'
import { sendInstagramFromQueue } from '../services/channels/instagram.js'

const r = express.Router()
r.post('/api/ig/send', async (req, res) => {
  try {
    const { contact_id, text } = req.body || {}
    if (!contact_id || !text) throw new Error('missing_params')

    const { data: contact } = await supa.from('contacts').select('*').eq('id', contact_id).maybeSingle()
    if (!contact) throw new Error('contact_not_found')

    const queueRow = { id: 'manual', user_id: req.user?.id || null }
    if (!queueRow.user_id) throw new Error('missing_user')

    const out = await sendInstagramFromQueue({ queueRow, contact, text })
    res.json({ ok: true, out })
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || 'ig_send_failed' })
  }
})
export default r

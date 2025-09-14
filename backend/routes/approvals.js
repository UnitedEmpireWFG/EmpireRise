import { Router } from 'express'
import { supa } from '../db.js'

const router = Router()

// GET /api/approvals?limit=50
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(200, Number(req.query.limit || 50))

    // Select * so we don't reference columns that aren't there (e.g., to_name)
    const { data, error } = await supa
      .from('approvals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    // Minimal shape the frontend needs; DO NOT touch fields that may not exist
    const rows = (data || []).map(r => ({
      id: r.id,
      platform: r.platform || null,
      contact_id: r.contact_id || null,
      handle: r.handle || r.to_handle || null,
      text: r.text || r.payload?.text || '',
      status: r.status || 'pending',
      created_at: r.created_at,
      // leave out to_name entirely (it doesn't exist in your DB)
    }))

    res.json({ ok: true, approvals: rows })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) })
  }
})

export default router
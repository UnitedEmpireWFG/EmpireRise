import { Router } from 'express'
import { supa } from '../db.js'

const router = Router()

// GET /api/queue?limit=100
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(300, Number(req.query.limit || 100))
    const { data, error } = await supa
      .from('queue')
      .select('*')
      .order('scheduled_at', { ascending: true })
      .limit(limit)
    if (error) throw error
    res.json({ ok: true, queue: data || [] })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) })
  }
})

export default router
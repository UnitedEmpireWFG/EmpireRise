// backend/routes/prospects.js
import { Router } from 'express'
import { supa } from '../db.js'

const router = Router()

// GET /api/prospects?limit=50
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)))

    const { data, error } = await supa
      .from('prospects')
      .select(`
        id, user_id, name, headline, company, location, public_id,
        li_profile_id, source, score, stage, created_at, updated_at
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) return res.status(200).json({ ok:false, error:error.message })
    res.json({ ok:true, prospects: data || [] })
  } catch (e) {
    res.status(200).json({ ok:false, error:String(e?.message || e) })
  }
})

export default router
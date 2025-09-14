import { Router } from 'express'
import { supa } from '../db.js'

const router = Router()

function smartScore(row) {
  // Very light heuristic until your learning loop kicks in
  // tune these as you like — purely on fields we already store
  let s = 0
  if (row.platform === 'linkedin') s += 8
  if (row.platform === 'instagram') s += 5
  if (row.platform === 'facebook') s += 4
  if (row.country === 'Canada' || /canada/i.test(row.location || '')) s += 10
  if (row.open_to_work) s += 12
  if ((row.mutuals || 0) > 10) s += 6
  if (/coach|sales|server|barista|fitness|student/i.test(row.headline || row.bio || '')) s += 8
  s = Math.min(100, Math.round((s / 50) * 100)) // normalize into 0-100
  return s
}

// GET /api/leads?limit=100
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(500, Number(req.query.limit || 100))

    const { data, error } = await supa
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    const rows = (data || []).map(r => ({
      id: r.id,
      platform: r.platform,
      handle: r.handle || r.username || null,
      first_name: r.first_name || null,
      last_name: r.last_name || null,
      headline: r.headline || null,
      bio: r.bio || null,
      location: r.location || null,
      open_to_work: !!r.open_to_work,
      mutuals: r.mutuals || 0,
      created_at: r.created_at,
      updated_at: r.updated_at || r.created_at, // fallback so column not required
      score: r.score ?? smartScore(r)           // attach pct chance (0–100)
    }))

    res.json({ ok: true, leads: rows })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) })
  }
})

export default router
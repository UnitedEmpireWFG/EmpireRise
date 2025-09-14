import { Router } from 'express'
import { supa } from '../db.js'

const router = Router()

router.get('/admin/users', async (_req, res) => {
  try {
    const { data, error } = await supa.from('users').select('id,email,created_at').limit(200)
    if (error) throw error
    res.json({ ok: true, users: data || [] })
  } catch (e) {
    res.status(200).json({ ok:false, error: String(e.message || e) })
  }
})

export default router
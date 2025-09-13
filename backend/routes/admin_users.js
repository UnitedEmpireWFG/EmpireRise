import { Router } from 'express'
import { supaAdmin } from '../db.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const r = Router()

// Create user (admin only)
// POST /api/admin/users  { email, password, name?, role?('member'|'admin') }
r.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {}
    if (!email || !password) throw new Error('email_and_password_required')

    const app_role = role === 'admin' ? 'admin' : 'member'

    const { data, error } = await supaAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { app_role },
      user_metadata: { name: name || '' }
    })
    if (error) throw error

    return res.json({ ok: true, user: { id: data.user?.id, email, role: app_role } })
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message || 'create_failed' })
  }
})

// Update role (admin only)
// PATCH /api/admin/users/:id/role  { role:'member'|'admin' }
r.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { role } = req.body || {}
    const app_role = role === 'admin' ? 'admin' : 'member'

    const { data, error } = await supaAdmin.auth.admin.updateUserById(id, {
      app_metadata: { app_role }
    })
    if (error) throw error

    return res.json({ ok: true, user: { id: data.user?.id, role: app_role } })
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message || 'update_failed' })
  }
})

export default r

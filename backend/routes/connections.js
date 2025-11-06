import { Router } from 'express'
import { supa } from '../db.js'

const router = Router()

function getUserId(req) {
  return req.user?.id || req.user?.user_id || req.user?.sub || null
}

router.get('/list', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const { data, error } = await supa
      .from('connections')
      .select('id, user_id, platform, access_token, refresh_token, expires_at, scope, meta, created_at, updated_at')
      .eq('user_id', userId)
      .order('platform', { ascending: true })

    if (error) throw error

    const items = (data || []).map(row => ({
      id: row.id || `${row.user_id || userId}-${row.platform}`,
      platform: row.platform,
      status: row.access_token ? 'connected' : 'missing',
      scope: row.scope,
      expires_at: row.expires_at,
      meta: row.meta,
      updated_at: row.updated_at
    }))

    res.json({ ok: true, items })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

export default router

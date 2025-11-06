// backend/routes/prospects.js
import { Router } from 'express'
import {
  fetchProspects,
  summarizeProspects,
  createProspect,
  patchProspect,
  markProspectDnc,
  convertProspect
} from '../services/prospectService.js'

const router = Router()

function getUserId(req) {
  return req.user?.id || req.user?.user_id || req.user?.sub || null
}

function safeJson(res, payload) {
  return res.status(200).json(payload)
}

function normalizeStatus(status) {
  if (!Number.isInteger(status)) return 500
  if (status < 400) return 500
  if (status > 599) return 500
  return status
}

function handleError(res, error) {
  const status = normalizeStatus(error?.status)
  const message = String(error?.message || error || 'unknown_error')
  return res.status(status).json({ ok: false, error: message })
function sanitizeProspectRow(row = {}) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    handle: row.handle || row.li_handle || null,
    platform: row.platform || 'linkedin',
    status: row.status || row.stage || 'new',
    dnc: !!row.dnc,
    dnc_reason: row.dnc_reason || null,
    note: row.note || null,
    profile_urls: row.profile_urls || row.links || null,
    source: row.source || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

async function fetchProspects({ userId, limit = 50, includeDnc = false }) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)))
  const query = supa
    .from('prospects')
    .select(`
      id, user_id, name, handle, li_handle, platform, status, stage, dnc,
      dnc_reason, note, profile_urls, links, source, created_at, updated_at
    `)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(safeLimit)

  if (!includeDnc) {
    query.eq('dnc', false)
  } else {
    query.eq('dnc', true)
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(sanitizeProspectRow)
}

// GET /api/prospects?limit=50
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const prospects = await fetchProspects({
      userId,
      limit: req.query.limit,
      includeDnc: false
    })
    safeJson(res, { ok: true, prospects })
  } catch (error) {
    handleError(res, error)
    const prospects = await fetchProspects({ userId, limit: req.query.limit, includeDnc: false })
    res.json({ ok: true, prospects })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

// GET /api/prospects/list/dnc
router.get('/list/dnc', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const prospects = await fetchProspects({
      userId,
      limit: req.query.limit,
      includeDnc: true
    })
    safeJson(res, { ok: true, prospects })
  } catch (error) {
    handleError(res, error)
  }
})

// GET /api/prospects/stats
router.get('/stats', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const summary = await summarizeProspects({ userId })
    safeJson(res, summary)
  } catch (error) {
    handleError(res, error)
    const prospects = await fetchProspects({ userId, limit: req.query.limit, includeDnc: true })
    res.json({ ok: true, prospects })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

// POST /api/prospects
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const prospect = await createProspect({ userId, payload: req.body || {} })
    safeJson(res, { ok: true, prospect })
  } catch (error) {
    handleError(res, error)

    const { name, handle, platform, note, profile_urls } = req.body || {}
    if (!name && !handle) {
      return res.status(400).json({ ok: false, error: 'name_or_handle_required' })
    }

    const row = {
      user_id: userId,
      name: name || null,
      handle: handle || null,
      platform: platform || 'linkedin',
      note: note || null,
      profile_urls: profile_urls || null,
      status: 'new',
      dnc: false,
      source: 'manual',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supa
      .from('prospects')
      .insert(row)
      .select()
      .single()

    if (error) throw error

    res.json({ ok: true, prospect: sanitizeProspectRow(data) })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

// PATCH /api/prospects/:id
router.patch('/:id', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const { id } = req.params
    const prospect = await patchProspect({ userId, id, changes: req.body || {} })
    safeJson(res, { ok: true, prospect })
  } catch (error) {
    handleError(res, error)

    const allowed = ['name', 'handle', 'platform', 'status', 'stage', 'note', 'profile_urls']
    const patch = {}
    for (const key of allowed) {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
        patch[key] = req.body[key]
      }
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'no_fields' })
    }
    patch.updated_at = new Date().toISOString()

    const { data, error } = await supa
      .from('prospects')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error

    res.json({ ok: true, prospect: sanitizeProspectRow(data) })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

// POST /api/prospects/:id/dnc
router.post('/:id/dnc', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const { id } = req.params
    const reason = req.body?.reason || 'manual'
    const prospect = await markProspectDnc({ userId, id, reason })
    safeJson(res, { ok: true, prospect })
  } catch (error) {
    handleError(res, error)

  const patch = {
    dnc: true,
    dnc_reason: reason,
    status: 'dnc',
    updated_at: new Date().toISOString()
  }

    const { data, error } = await supa
      .from('prospects')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error

    res.json({ ok: true, prospect: sanitizeProspectRow(data) })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

// POST /api/prospects/:id/convert
router.post('/:id/convert', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const { id } = req.params
    const prospect = await convertProspect({ userId, id })
    safeJson(res, { ok: true, prospect })
  } catch (error) {
    handleError(res, error)

  const patch = {
    status: 'converted',
    updated_at: new Date().toISOString()
  }

    const { data, error } = await supa
      .from('prospects')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error

    res.json({ ok: true, prospect: sanitizeProspectRow(data) })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

export default router

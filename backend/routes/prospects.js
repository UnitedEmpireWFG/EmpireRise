// backend/routes/prospects.js
import { Router } from 'express'
import { supa } from '../db.js'

const router = Router()

function getUserId(req) {
  return req.user?.id || req.user?.user_id || req.user?.sub || null
}

function sanitizeProspectRow(row = {}) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    headline: row.headline || null,
    company: row.company || null,
    location: row.location || null,
    handle: row.handle || row.li_handle || null,
    platform: row.platform || 'linkedin',
    status: row.status || row.stage || 'new',
    stage: row.stage || row.status || 'new',
    dnc: !!row.dnc,
    dnc_reason: row.dnc_reason || null,
    note: row.note || null,
    profile_urls: row.profile_urls || row.links || null,
    public_id: row.public_id || null,
    li_profile_id: row.li_profile_id || null,
    score: typeof row.score === 'number' ? row.score : row.score ? Number(row.score) || null : null,
    source: row.source || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

const stageOrder = [
  'new',
  'queued',
  'connecting',
  'connected',
  'messaged',
  'responded',
  'qualified',
  'converted',
  'booked',
  'nurture',
  'follow_up',
  'dnc'
]

function stageLabel(key = '') {
  const norm = String(key || '').trim().toLowerCase()
  if (!norm) return 'Unknown'
  if (norm === 'dnc') return 'Do Not Contact'
  return norm
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function summarizeProspects({ userId }) {
  let query = supa
    .from('prospects')
    .select('stage,status,dnc,count:id', { head: false })
    .eq('user_id', userId)

  let { data, error } = await query

  if (error) {
    const msg = String(error.message || error).toLowerCase()
    if (msg.includes('column') && msg.includes('dnc')) {
      const fallback = await supa
        .from('prospects')
        .select('stage,status,count:id', { head: false })
        .eq('user_id', userId)
      data = fallback.data
      error = fallback.error
    }
  }

  if (error) throw error

  const stages = new Map()
  const statuses = new Map()
  let total = 0
  let dncTotal = 0

  for (const row of data || []) {
    const count = Number(
      row.count ?? row.count_id ?? row.countId ?? row.cnt ?? 0
    ) || 0

    if (!count) continue

    const isDnc =
      row.dnc === true ||
      row.dnc === 'true' ||
      String(row.stage || '').toLowerCase() === 'dnc' ||
      String(row.status || '').toLowerCase() === 'dnc'
    const stageKey = String(row.stage || row.status || (isDnc ? 'dnc' : 'unknown')).toLowerCase()
    const statusKey = String(row.status || row.stage || (isDnc ? 'dnc' : 'unknown')).toLowerCase()

    total += count
    if (isDnc || stageKey === 'dnc' || statusKey === 'dnc') dncTotal += count

    const stageEntry = stages.get(stageKey) || { key: stageKey, count: 0, statuses: new Map() }
    stageEntry.count += count
    stageEntry.statuses.set(statusKey, (stageEntry.statuses.get(statusKey) || 0) + count)
    stages.set(stageKey, stageEntry)

    statuses.set(statusKey, (statuses.get(statusKey) || 0) + count)
  }

  const orderedStages = Array.from(stages.values()).sort((a, b) => {
    const ia = stageOrder.indexOf(a.key)
    const ib = stageOrder.indexOf(b.key)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.key.localeCompare(b.key)
  })

  const stageSummaries = orderedStages.map(entry => {
    const breakdown = Array.from(entry.statuses.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => ({
        key,
        label: stageLabel(key),
        count: value,
        percent: entry.count ? Math.round((value / entry.count) * 1000) / 10 : 0
      }))

    return {
      key: entry.key,
      label: stageLabel(entry.key),
      count: entry.count,
      percent: total ? Math.round((entry.count / total) * 1000) / 10 : 0,
      statuses: breakdown
    }
  })

  const statusSummaries = Array.from(statuses.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      key,
      label: stageLabel(key),
      count,
      percent: total ? Math.round((count / total) * 1000) / 10 : 0
    }))

  return {
    ok: true,
    total,
    active: total - dncTotal,
    stages: stageSummaries,
    statuses: statusSummaries
  }
}

async function fetchProspects({ userId, limit = 50, includeDnc = false }) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)))
  const query = supa
    .from('prospects')
    .select(`
      id, user_id, name, headline, company, location, handle, li_handle,
      platform, status, stage, dnc, dnc_reason, note, profile_urls, links,
      public_id, li_profile_id, score, source, created_at, updated_at
    `)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(safeLimit)

  if (!includeDnc) {
    query.or('dnc.is.false,dnc.is.null')
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
    const prospects = await fetchProspects({ userId, limit: req.query.limit, includeDnc: true })
    res.json({ ok: true, prospects })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

// GET /api/prospects/stats
router.get('/stats', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const summary = await summarizeProspects({ userId })
    res.json(summary)
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

// POST /api/prospects
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

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

    const patch = {
      dnc: true,
      dnc_reason: reason,
      status: 'dnc',
      stage: 'dnc',
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

    const patch = {
      status: 'converted',
      stage: 'converted',
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

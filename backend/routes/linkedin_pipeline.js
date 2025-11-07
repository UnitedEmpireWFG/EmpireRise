import { Router } from 'express'
import { supa } from '../db.js'

const router = Router()

function countStatuses(statusRows = []) {
  const order = ['new', 'requested', 'connected', 'queued', 'error']
  const counts = Object.create(null)
  for (const key of order) counts[key] = 0
  for (const row of statusRows) {
    const status = (row?.status || '').toLowerCase()
    if (!status) continue
    if (!counts[status] && counts[status] !== 0) counts[status] = 0
    counts[status] += row.count || 0
  }
  return counts
}

async function fetchStatusCounts() {
  const statuses = ['new', 'requested', 'connected', 'queued', 'error']
  const rows = []
  for (const status of statuses) {
    try {
      const { count } = await supa
        .from('candidates')
        .select('id', { count: 'exact', head: true })
        .eq('platform', 'linkedin')
        .eq('status', status)
      rows.push({ status, count: count || 0 })
    } catch {
      rows.push({ status, count: 0 })
    }
  }
  return countStatuses(rows)
}

router.get('/', async (_req, res) => {
  try {
    const [statusCounts, candidatesResp, queueResp, logResp] = await Promise.all([
      fetchStatusCounts(),
      fetchWithFallback('candidates', {
        matchers: q => q.eq('platform', 'linkedin'),
        limit: 50
      }),
      fetchWithFallback('connect_queue', {
        matchers: q => q.eq('platform', 'linkedin'),
        limit: 25
      }),
      fetchWithFallback('connect_log', {
        matchers: q => q.eq('platform', 'linkedin'),
        limit: 25
      })
    ])

    if (candidatesResp.error || queueResp.error || logResp.error) {
      const errors = [candidatesResp.error, queueResp.error, logResp.error]
        .filter(Boolean)
        .map(e => e.message || e)
      if (errors.length) throw new Error(errors.join('; '))
      supa
        .from('candidates')
        .select('id, handle, status, headline, location, open_to_work, created_at, updated_at')
        .eq('platform', 'linkedin')
        .order('created_at', { ascending: false })
        .limit(50),
      supa
        .from('connect_queue')
        .select('id, handle, status, scheduled_at, created_at, updated_at, platform')
        .eq('platform', 'linkedin')
        .order('created_at', { ascending: false })
        .limit(25),
      supa
        .from('connect_log')
        .select('id, handle, action, ok, error, created_at, platform')
        .eq('platform', 'linkedin')
        .order('created_at', { ascending: false })
        .limit(25)
    ])

    const candidates = candidatesResp.data || []
    const queue = queueResp.data || []
    const log = logResp.data || []
    const errors = [candidatesResp.error, queueResp.error, logResp.error].filter(Boolean)
    if (errors.length) {
      throw new Error(errors.map(e => e.message || e).join('; '))
    }

    res.json({
      ok: true,
      stats: statusCounts,
      candidates: (candidatesResp.data || []).map(normalizeTimestamps),
      queue: (queueResp.data || []).map(normalizeTimestamps),
      log: (logResp.data || []).map(normalizeTimestamps)
      candidates,
      queue,
      log
    })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

function normalizeTimestamps(row = {}) {
  const createdAt = row.created_at || row.inserted_at || row.createdat || row.insertedat || row.createdAt || row.insertedAt || null
  const updatedAt = row.updated_at || row.modified_at || row.updatedat || row.updatedAt || row.inserted_at || row.insertedat || createdAt
  return {
    ...row,
    created_at: createdAt,
    updated_at: updatedAt
  }
}

async function fetchWithFallback(table, { matchers, limit = 50 }) {
  const apply = (query) => (typeof matchers === 'function' ? matchers(query) : query)
  const orderColumns = ['created_at', 'inserted_at', 'createdat', 'insertedat', 'createdAt', 'insertedAt', 'id']

  for (const column of orderColumns) {
    const builder = apply(supa.from(table).select('*'))
    const resp = await builder
      .order(column, { ascending: false, nullsFirst: false })
      .limit(limit)
    if (!resp.error || resp.error.code !== '42703') {
      return resp
    }
  }

  return apply(supa.from(table).select('*')).limit(limit)
}

export default router

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
      candidates,
      queue,
      log
    })
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

export default router

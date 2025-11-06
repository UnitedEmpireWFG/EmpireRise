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
  }
})

export default router

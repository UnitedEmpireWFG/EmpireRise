import { Router } from 'express'
import { createHash } from 'node:crypto'
import fs from 'fs'
import path from 'path'
import { supa } from '../db.js'

const router = Router()
const TABLE = 'li_contacts_stage'
const BASE_DIR = '/opt/render/project/.data/li_cookies'
const MAX_PAYLOAD = 2000

let driverModule = null

export async function loadDriverModule() {
  if (driverModule) return driverModule
  try {
    driverModule = await import('../drivers/driver_linkedin_smart.js')
    return driverModule
  } catch (e) {
    console.log('li_import_driver_load_error', e?.message || e)
    driverModule = null
    return null
  }
}

async function loadCookiesMeta(userId) {
  const cookiesPath = path.join(BASE_DIR, `${userId}.json`)
  try {
    const buf = await fs.promises.readFile(cookiesPath, 'utf-8')
    const parsed = JSON.parse(buf)
    const cookiesLength = Array.isArray(parsed) ? parsed.length : 0
    return { exists: true, cookiesLength, cookiesPath }
  } catch (e) {
    console.error('li_cookies_load_error', { userId, error: e })
    return { exists: false, cookiesLength: 0, cookiesPath }
  }
}

export async function fetchViaDriver({ userId, limit, flavor }) {
  if (!userId) return []
  const cookiesMeta = await loadCookiesMeta(userId)
  console.log('li_cookies_load_attempt', { userId, cookiesPath: cookiesMeta.cookiesPath })
  console.log('li_cookies_load_result', { userId, cookies_length: cookiesMeta.cookiesLength, exists: cookiesMeta.exists })

  if (!cookiesMeta.exists || cookiesMeta.cookiesLength === 0) {
    if (cookiesMeta.exists && cookiesMeta.cookiesLength === 0) {
      console.log('li_import_empty_cookies', { userId, cookiesPath: cookiesMeta.cookiesPath })
    }
    if (!cookiesMeta.exists) {
      console.log('li_import_no_cookies', userId)
    }
    return []
  }

  const mod = await loadDriverModule()
  if (!mod) return []

  process.env.LI_COOKIES_PATH = cookiesMeta.cookiesPath

  const preferProspects = flavor === 'prospects'
  const fetchFn = preferProspects && typeof mod.fetchProspects === 'function'
    ? mod.fetchProspects
    : typeof mod.fetchConnections === 'function'
      ? mod.fetchConnections
      : typeof mod.fetchProspects === 'function'
        ? mod.fetchProspects
        : null

  if (!fetchFn) return []

  try {
    const list = await fetchFn({ userId, limit })
    return Array.isArray(list) ? list : []
  } catch (e) {
    console.log('li_import_driver_run_error', e?.message || e)
    return []
  }
}

function getUserId(req) {
  return req.user?.id || req.user?.sub || null
}

export function toNull(value) {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed.length ? trimmed : null
}

export function normalizePublicId(value) {
  const raw = toNull(value)
  if (!raw) return null
  const stripped = raw
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, '')
    .replace(/[/?#].*$/, '')
  return stripped.toLowerCase()
}

export function normalizeProfileUrl(value, fallbackId) {
  const raw = toNull(value)
  if (raw && /^https?:\/\//i.test(raw)) return raw
  if (raw && raw.startsWith('linkedin.com')) return `https://${raw}`
  if (fallbackId) return `https://www.linkedin.com/in/${fallbackId}`
  return raw
}

function safeJson(value) {
  try { return JSON.parse(JSON.stringify(value ?? null)) }
  catch { return null }
}

export function fingerprintFor(row) {
  const direct = toNull(row.public_id || row.profile_url || row.handle || row.li_handle || row.external_id)
  if (direct) return direct.toLowerCase()
  const basis = [row.name, row.headline || row.title, row.company, row.region]
    .map(v => toNull(v) || '')
    .filter(Boolean)
    .join('|')
  if (!basis) return null
  return createHash('sha1').update(basis).digest('hex')
}

export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = toNull(raw.name || raw.full_name || raw.displayName || `${raw.first_name || raw.firstName || ''} ${raw.last_name || raw.lastName || ''}`.trim())
  const publicId = normalizePublicId(raw.public_id || raw.li_profile_id || raw.vanity || raw.handle || raw.profile_id || raw.profileId || raw.id)
  const profileUrl = normalizeProfileUrl(raw.profile_url || raw.profileUrl || raw.url || raw.link, publicId)
  const headline = toNull(raw.headline || raw.headLine || raw.title || raw.occupation)
  const title = toNull(raw.title || raw.role || raw.position || raw.job_title || headline)
  const company = toNull(raw.company || raw.company_name || raw.organization || raw.employer || raw.companyName)
  const region = toNull(raw.region || raw.location || raw.location_text || raw.city || raw.country)

  const candidate = {
    name,
    headline,
    title,
    company,
    region,
    public_id: publicId,
    profile_url: profileUrl,
    raw: safeJson(raw)
  }
  const fingerprint = fingerprintFor({ ...raw, ...candidate })
  if (!fingerprint) return null
  return { ...candidate, fingerprint }
}

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const mode = String(req.query.mode || '').toLowerCase()
    if (mode === 'count') {
      const { count, error } = await supa
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('processed_at', null)
      if (error) return res.status(200).json({ ok: false, error: error.message })
      return res.json({ ok: true, staged: count || 0 })
    }

    if (mode === 'preview') {
      const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)))
      const { data, error } = await supa
        .from(TABLE)
        .select('id,name,headline,company,title,region,public_id,profile_url,created_at,processed_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return res.status(200).json({ ok: false, error: error.message })
      return res.json({ ok: true, items: data || [] })
    }

    return res.json({ ok: true, message: 'linkedin_import_ready' })
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const body = req.body || {}
    let items = []
    if (Array.isArray(body)) items = body
    else if (Array.isArray(body.items)) items = body.items
    else if (Array.isArray(body.contacts)) items = body.contacts
    else if (Array.isArray(body.connections)) items = body.connections

    const modeHint = String(req.query.mode || body.mode || body.source || '').toLowerCase()
    let wantDriver = ['driver', 'fetch', 'connections', 'prospects'].includes(modeHint)
    const preferProspects = modeHint === 'prospects'
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || body.limit || 200)))

    if (!items.length) wantDriver = true

    let driverFetched = 0
    if (wantDriver) {
      const viaDriver = await fetchViaDriver({ userId, limit, flavor: preferProspects ? 'prospects' : 'connections' })
      if (viaDriver.length) {
        items = viaDriver
        driverFetched = viaDriver.length
      }
    }

    if (!items.length) {
      return res.json({
        ok: true,
        imported: 0,
        skipped: 0,
        duplicates: 0,
        fetched: driverFetched,
        source: wantDriver ? 'driver' : 'payload'
      })
    }

    const capLimit = wantDriver ? limit : MAX_PAYLOAD
    const capped = items.slice(0, Math.min(items.length, capLimit))
    let skipped = 0
    let duplicatePayload = 0
    const dedup = new Map()

    for (const raw of capped) {
      const normalized = normalizeItem(raw)
      if (!normalized) { skipped++; continue }
      if (dedup.has(normalized.fingerprint)) { duplicatePayload++; continue }
      dedup.set(normalized.fingerprint, normalized)
    }

    const rows = Array.from(dedup.values())
    if (!rows.length) {
      return res.json({ ok: true, imported: 0, skipped, duplicates: duplicatePayload })
    }

    const fingerprints = rows.map(r => r.fingerprint)
    const { data: existing, error: existingError } = await supa
      .from(TABLE)
      .select('fingerprint')
      .eq('user_id', userId)
      .in('fingerprint', fingerprints)
    if (existingError) throw existingError

    const existingSet = new Set((existing || []).map(r => r.fingerprint))

    const payload = rows.map(r => ({
      user_id: userId,
      fingerprint: r.fingerprint,
      public_id: r.public_id,
      profile_url: r.profile_url,
      name: r.name,
      headline: r.headline,
      company: r.company,
      title: r.title,
      region: r.region,
      raw: r.raw,
      created_at: new Date().toISOString(),
      processed_at: null
    }))

    const { error: upsertError } = await supa
      .from(TABLE)
      .upsert(payload, { onConflict: 'user_id,fingerprint' })
    if (upsertError) throw upsertError

    const imported = rows.length - existingSet.size
    const duplicates = existingSet.size + duplicatePayload

    return res.json({
      ok: true,
      imported,
      duplicates,
      skipped,
      fetched: driverFetched,
      source: wantDriver ? 'driver' : 'payload'
    })
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) })
  }
})

export default router

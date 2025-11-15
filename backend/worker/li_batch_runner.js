import path from 'node:path'
import fs from 'node:fs/promises'

import { supaAdmin } from '../db.js'
import { LinkedInDriver } from '../services/linkedin_driver.js'
import { looksCanadian, notInExcluded, normalize } from '../services/filters/smart_canada.js'

const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'
const DEFAULT_CONNECT_QUOTA = Number(process.env.LI_BATCH_DEFAULT_QUOTA || 20)
const DM_RATIO = Math.max(0, Math.min(1, Number(process.env.LI_BATCH_DM_RATIO ?? 0.6))) || 0.6
const EXCLUDE_TERMS = (process.env.LI_BATCH_EXCLUDE_TERMS || 'student,intern,seeking,looking for work')
  .split(',')
  .map(t => t.trim())
  .filter(Boolean)
const DM_KEYWORDS = (process.env.LI_BATCH_DM_KEYWORDS || 'advisor,planning,finance,financial,wealth,retirement,insurance')
  .split(',')
  .map(t => t.trim())
  .filter(Boolean)

const nap = (ms) => new Promise(r => setTimeout(r, ms))

async function hasCookies(userId) {
  if (!userId) return false
  try {
    const cookiesPath = path.join(COOKIES_DIR, `${userId}.json`)
    await fs.access(cookiesPath)
    return true
  } catch {
    return false
  }
}

function normalizeHandle(handle) {
  return String(handle || '').trim().toLowerCase()
}

function buildProfileUrl(handle) {
  const h = normalizeHandle(handle)
  if (!h) return null
  return `https://www.linkedin.com/in/${encodeURIComponent(h)}/`
}

function qualifies(prospect) {
  if (!prospect || !prospect.handle) return false
  const headline = String(prospect.headline || '')
  const location = String(prospect.location || '')
  const blob = `${headline} | ${location}`
  const normalized = normalize(blob)

  if (!looksCanadian({ locationText: location, bioText: headline })) return false
  if (!notInExcluded(blob, EXCLUDE_TERMS.join(','))) return false
  if (headline.length < 3) return false
  if (EXCLUDE_TERMS.some(term => normalized.includes(term))) return false
  return true
}

function qualifiesForDm(prospect) {
  if (!qualifies(prospect)) return false
  const text = normalize(`${prospect.headline || ''} ${prospect.location || ''}`)
  return prospect.open_to_work === true || DM_KEYWORDS.some(term => text.includes(term))
}

function buildDmBody(prospect) {
  const first = String(prospect?.name || '').split(' ')[0] || 'there'
  const region = String(prospect?.location || '').split(',')[0]?.trim()
  const friendlyRegion = region ? `${region.trim()} ` : ''
  return `Hi ${first}! Always great to meet ${friendlyRegion}folks keeping an eye on their finances. What’s top of mind for you this year?`
}

async function ensureContact(handle) {
  const normalized = normalizeHandle(handle)
  if (!normalized) return null
  const { data: existing, error: existingError } = await supaAdmin
    .from('contacts')
    .select('id')
    .eq('platform', 'linkedin')
    .eq('handle', normalized)
    .limit(1)

  if (existingError) {
    console.log('[li_batch_runner] contacts_lookup_error', existingError.message)
    return null
  }
  if (existing?.length) return existing[0].id

  const { data: inserted, error: insertError } = await supaAdmin
    .from('contacts')
    .insert({ platform: 'linkedin', handle: normalized, tags: ['prospect'] })
    .select('id')
    .maybeSingle()

  if (insertError) {
    console.log('[li_batch_runner] contacts_insert_error', insertError.message)
    return null
  }
  return inserted?.id || null
}

async function fetchPrefs(userIds = []) {
  if (!userIds.length) return new Map()
  const { data, error } = await supaAdmin
    .from('li_batch_prefs')
    .select('user_id,is_enabled,daily_quota,mode')
    .in('user_id', userIds)

  if (error) {
    console.log('[li_batch_runner] prefs_fetch_error', error.message)
    return new Map()
  }

  const map = new Map()
  for (const row of data || []) {
    map.set(row.user_id, row)
  }
  return map
}

async function loadExistingHandles(userId) {
  const handles = new Set()
  if (!userId) return handles

  const queries = [
    supaAdmin.from('prospects').select('li_handle').eq('user_id', userId),
    supaAdmin.from('connect_queue').select('handle').eq('user_id', userId)
  ]

  const results = await Promise.allSettled(queries)
  for (const res of results) {
    if (res.status === 'fulfilled') {
      const rows = res.value?.data || []
      for (const row of rows) {
        const handle = normalizeHandle(row?.li_handle || row?.handle)
        if (handle) handles.add(handle)
      }
    }
  }
  return handles
}

async function loadQueuedContactIds(userId) {
  if (!userId) return new Set()
  const { data, error } = await supaAdmin
    .from('queue')
    .select('contact_id')
    .eq('user_id', userId)
    .not('contact_id', 'is', null)

  if (error) {
    console.log('[li_batch_runner] queue_lookup_error', error.message)
    return new Set()
  }
  const ids = new Set()
  for (const row of data || []) {
    if (row?.contact_id) ids.add(row.contact_id)
  }
  return ids
}

export async function runLinkedInBatch(globalUserCache) {
  console.log('[li_batch_runner] LinkedIn batch started.')

  try {
    if (!globalUserCache || typeof globalUserCache.list !== 'function') {
      throw new Error('invalid_user_cache')
    }

    if (typeof globalUserCache.refresh === 'function') {
      await globalUserCache.refresh().catch(() => null)
    }

    const users = Array.isArray(globalUserCache.list()) ? globalUserCache.list() : []
    if (!users.length) {
      console.log('[li_batch_runner] No active users in cache.')
      return { queuedConnects: 0, queuedDMs: 0 }
    }

    const userIds = users.map(u => u?.id).filter(Boolean)
    const prefsMap = await fetchPrefs(userIds)

    let totalConnects = 0
    let totalDMs = 0

    for (const user of users) {
      const userId = user?.id
      if (!userId) continue

      const prefs = prefsMap.get(userId)
      const enabled = prefs ? prefs.is_enabled !== false : user?.li_daily_enabled !== false
      if (!enabled) {
        console.log('[li_batch_runner] skip_user_disabled', userId)
        continue
      }

      if (!(await hasCookies(userId))) {
        console.log('[li_batch_runner] skip_no_cookies', userId)
        continue
      }

      const quota = Number(prefs?.daily_quota || user?.li_daily_quota || DEFAULT_CONNECT_QUOTA) || DEFAULT_CONNECT_QUOTA
      const dmQuota = Math.max(0, Math.round(quota * DM_RATIO))

      const driver = new LinkedInDriver({ cookiesPath: path.join(COOKIES_DIR, `${userId}.json`) })
      let prospects = []
      try {
        prospects = await driver.suggestedPeopleCanada(quota * 2)
      } catch (error) {
        console.log('[li_batch_runner] driver_error', userId, error?.message || error)
        continue
      } finally {
        try { await driver.close?.() } catch {}
      }

      const existingHandles = await loadExistingHandles(userId)
      const queuedContactIds = await loadQueuedContactIds(userId)

      const nowIso = new Date().toISOString()
      const connectRows = []
      const dmRows = []
      const prospectRows = []

      for (const prospect of prospects) {
        if (connectRows.length >= quota && dmRows.length >= dmQuota) break
        if (!qualifies(prospect)) continue

        const handle = normalizeHandle(prospect.handle)
        if (!handle || existingHandles.has(handle)) continue

        const profileUrl = buildProfileUrl(handle)
        existingHandles.add(handle)

        prospectRows.push({
          user_id: userId,
          source: 'linkedin_batch',
          name: prospect.name || null,
          headline: prospect.headline || null,
          location: prospect.location || null,
          region: prospect.location || null,
          li_handle: handle,
          profile_url: profileUrl,
          created_at: nowIso,
          updated_at: nowIso
        })

        if (connectRows.length < quota) {
          connectRows.push({
            user_id: userId,
            platform: 'linkedin',
            handle,
            profile_url: profileUrl,
            status: 'queued',
            scheduled_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
            note: null
          })
        }

        if (dmRows.length < dmQuota && qualifiesForDm(prospect)) {
          const contactId = await ensureContact(handle)
          if (!contactId || queuedContactIds.has(contactId)) continue
          queuedContactIds.add(contactId)

          const body = buildDmBody(prospect)
          dmRows.push({
            user_id: userId,
            platform: 'linkedin',
            channel: 'dm',
            status: 'ready',
            scheduled_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
            contact_id: contactId,
            campaign: 'li_batch',
            payload: { text: body, handle, source: 'li_batch', location: prospect.location || null },
            preview: body.slice(0, 160)
          })
        }

        await nap(50)
      }

      if (!connectRows.length && !dmRows.length) {
        console.log('[li_batch_runner] nothing_qualified', userId)
        continue
      }

      if (prospectRows.length) {
        await supaAdmin
          .from('prospects')
          .upsert(prospectRows, { onConflict: 'user_id,li_handle' })
          .catch(e => console.log('[li_batch_runner] prospects_upsert_error', userId, e.message))
      }

      if (connectRows.length) {
        const { error } = await supaAdmin.from('connect_queue').insert(connectRows)
        if (error) {
          console.log('[li_batch_runner] connect_insert_error', userId, error.message)
        } else {
          totalConnects += connectRows.length
        }
      }

      if (dmRows.length) {
        const { error } = await supaAdmin.from('queue').insert(dmRows)
        if (error) {
          console.log('[li_batch_runner] dm_insert_error', userId, error.message)
        } else {
          totalDMs += dmRows.length
        }
      }

      console.log(`[li_batch_runner] user ${userId} queued ${connectRows.length} connects / ${dmRows.length} DMs`)
    }

    console.log(`[li_batch_runner] queued ${totalConnects} connects / ${totalDMs} DMs total`)
    return { queuedConnects: totalConnects, queuedDMs: totalDMs }
  } catch (error) {
    console.log('[li_batch_runner] batch_error', error?.message || error)
    return { queuedConnects: 0, queuedDMs: 0, error: error?.message || String(error) }
  } finally {
    console.log('[li_batch_runner] LinkedIn batch finished.')
  }
}

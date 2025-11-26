// backend/worker/smart_driver.js
import { supa, supaAdmin } from '../db.js'
import { aiComplete } from '../lib/ai.js'
import { timePolicy } from '../services/time_windows.js'
import { fetchViaDriver, normalizeItem } from '../routes/import_linkedin.js'
import { fetchProfileLocation } from '../drivers/driver_linkedin_smart.js'

const BATCH = Number(process.env.SMART_BATCH || 25)         // how many prospects per tick
const LOOP_MS = Number(process.env.SMART_LOOP_MS || 60_000) // 60s default
const LOCATION_ALLOWLIST = String(process.env.SMART_LOCATION_ALLOWLIST || process.env.LOCATION_ALLOWLIST || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

const columnCache = new Map()

async function tableHasColumn(table, column) {
  // Skip schema checks for prospects.updated_at to avoid cached schema issues
  if (table === 'prospects' && column === 'updated_at') return true

  const key = `${table}.${column}`
  if (columnCache.has(key)) return columnCache.get(key)

  const { error } = await supaAdmin
    .from(table)
    .select(column)
    .limit(1)

  const errorMsg = (error?.message || '').toLowerCase()
  const missingColumn = errorMsg.includes('column') && errorMsg.includes('does not exist')
  const schemaError = errorMsg.includes('schema') && errorMsg.includes('public')
  const exists = error ? !missingColumn : true

  if (error && !missingColumn) {
    console.warn('schema:column_check_error', key, error.message)
  }
  columnCache.set(key, schemaError ? false : exists)
  return exists
}

function nowIso() { return new Date().toISOString() }

function normalizeRegion(value) {
  const trimmed = String(value || '').trim()
  return trimmed.length ? trimmed : null
}

function displayName(entity = {}) {
  const fromName = String(entity.name || '').trim()
  if (fromName) return fromName

  const parts = [entity.first_name, entity.last_name]
    .map(v => String(v || '').trim())
    .filter(Boolean)
  return parts.join(' ').trim()
}

function regionMatchesAllowlist(region) {
  if (!LOCATION_ALLOWLIST.length) return true
  const normalized = normalizeRegion(region)
  if (!normalized) return false
  const lowered = normalized.toLowerCase()
  return LOCATION_ALLOWLIST.some(needle => lowered.includes(needle))
}

async function enrichRegion({ userId, stageId, prospectId, publicId, profileUrl }) {
  if (!userId || (!publicId && !profileUrl)) return null

  const enriched = await fetchProfileLocation({
    userId,
    handle: publicId,
    profileUrl
  }).catch(() => null)

  const location = normalizeRegion(enriched?.location)
  if (!location) return null

  const updates = []
  const [hasProspectRegion, hasStageRegion] = await Promise.all([
    tableHasColumn('prospects', 'region'),
    tableHasColumn('li_contacts_stage', 'region')
  ])
  if (prospectId && hasProspectRegion) updates.push(
    supa.from('prospects').update({ region: location }).eq('id', prospectId)
  )
  if (stageId && hasStageRegion) updates.push(
    supa.from('li_contacts_stage').update({ region: location }).eq('id', stageId)
  )

  // If the destination table does not have a region column, ignore the error so
  // the worker keeps running against slimmer schemas.
  await Promise.all(updates.map(async q => {
    const { error } = await q
    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('column') && msg.includes('region')) return null
      throw error
    }
    return null
  })).catch(() => null)

  return location
}

function splitNameParts(name = '') {
  const parts = String(name || '')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
  if (!parts.length) return { first: null, last: null }
  if (parts.length === 1) return { first: parts[0], last: null }
  const [first, ...rest] = parts
  return { first, last: rest.join(' ').trim() || null }
}

function normalizeProspectRow(row = {}) {
  const first = row.first_name || row.firstName || null
  const last = row.last_name || row.lastName || null
  const name = displayName({ name: row.name, first_name: first, last_name: last })
  const score = typeof row.score === 'number' ? row.score : 0
  const owner = row.owner_user_id || row.user_id || null

  return {
    ...row,
    owner_user_id: owner,
    user_id: row.user_id || owner,
    score,
    first_name: first,
    last_name: last,
    name,
    title: row.title || row.headline || null,
    headline: row.headline || null,
    region: row.region || row.location || null,
    profile_url: row.profile_url || row.linkedin_url || row.url || null,
    public_id: row.public_id || row.li_profile_id || row.li_handle || null
  }
}

async function selectProspectsForUser({ userId, limit = BATCH }) {
  const base = () => supa
    .from('prospects')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  let attempt = await base().eq('user_id', userId)
  if (attempt.error) {
    const msg = (attempt.error.message || '').toLowerCase()
    if (msg.includes('column') && msg.includes('user_id')) {
      attempt = await base().eq('owner_user_id', userId)
    }
  }

  if (attempt.error) throw new Error('scoreLeads.load_error ' + attempt.error.message)
  return (attempt.data || []).map(normalizeProspectRow)
}

async function selectProspectsByIds(ids = []) {
  if (!ids.length) return []
  const { data, error } = await supa
    .from('prospects')
    .select('*')
    .in('id', ids)
  if (error) throw new Error('generateDrafts.prospects_error ' + error.message)
  return (data || []).map(normalizeProspectRow)
}

async function getActiveUsers() {
  // Users who completed LI OAuth OR have cookies saved
  const { data: settings } = await supa
    .from('app_settings')
    .select('user_id, linkedin_access_token')
  const users = (settings || []).map(s => s.user_id)

  // Also include any user who uploaded cookies (file presence isn’t visible here; rely on stage table presence)
  const { data: stagedUsers } = await supa
    .from('li_contacts_stage')
    .select('user_id')
    .limit(1000)
  for (const row of (stagedUsers || [])) if (!users.includes(row.user_id)) users.push(row.user_id)

  return users
}

async function popStagedRows(userId) {
  // Prefer the RPC (which handles row locking + processed_at) but gracefully
  // fall back to manual queries if the RPC is unavailable or misconfigured.

  const { data: rpcRows, error: rpcError } = await supa
    .rpc('li_stage_for_user', { p_user_id: userId, p_limit: BATCH })

  if (!rpcError) return rpcRows || []

  const msg = rpcError.message || ''
  console.warn('smart_driver:pullProspects rpc_error', msg)

  const includeRegion = await tableHasColumn('li_contacts_stage', 'region')
  const stageColumns = [
    'id', 'user_id', 'name', 'headline', 'company', 'title', 'public_id', 'profile_url', 'created_at'
  ]
  if (includeRegion) stageColumns.splice(6, 0, 'region')

  const { data, error: fallbackError } = await supa
    .from('li_contacts_stage')
    .select(stageColumns.join(','))
    .eq('user_id', userId)
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (fallbackError) throw new Error('pullProspects.stage_error ' + fallbackError.message)
  const staged = data || []

  const ids = staged.map(row => row.id).filter(Boolean)
  if (ids.length) {
    const { error: markError } = await supa
      .from('li_contacts_stage')
      .update({ processed_at: nowIso() })
      .in('id', ids)
    if (markError) throw new Error('pullProspects.mark_error ' + markError.message)
  }

  return staged
}

async function stageFromDriver({ userId }) {
  if (!userId) return { staged: 0, fetched: 0 }

  try {
    const fetched = await fetchViaDriver({ userId, limit: BATCH, flavor: 'prospects' })
    const dedup = new Map()

    for (const raw of fetched || []) {
      const normalized = normalizeItem(raw)
      if (!normalized || dedup.has(normalized.fingerprint)) continue
      dedup.set(normalized.fingerprint, normalized)
    }

    const rows = Array.from(dedup.values())
    if (!rows.length) return { staged: 0, fetched: fetched?.length || 0 }

    const fingerprints = rows.map(r => r.fingerprint)
    const { data: existing, error: existingError } = await supa
      .from('li_contacts_stage')
      .select('fingerprint')
      .eq('user_id', userId)
      .in('fingerprint', fingerprints)

    if (existingError) throw new Error('stageFromDriver.lookup_error ' + existingError.message)

    const existingSet = new Set((existing || []).map(r => r.fingerprint))
    const stageHasRegion = await tableHasColumn('li_contacts_stage', 'region')
    const payload = rows
      .filter(r => !existingSet.has(r.fingerprint))
      .map(r => {
        const base = {
          user_id: userId,
          fingerprint: r.fingerprint,
          public_id: r.public_id,
          profile_url: r.profile_url,
          name: r.name,
          headline: r.headline,
          company: r.company,
          title: r.title,
          raw: r.raw,
          created_at: nowIso(),
          processed_at: null
        }

        if (stageHasRegion) base.region = r.region || null
        return base
      })

    if (!payload.length) return { staged: 0, fetched: fetched?.length || 0, duplicates: existingSet.size }

    const { error: upsertError } = await supa
      .from('li_contacts_stage')
      .upsert(payload, { onConflict: 'user_id,fingerprint' })
    if (upsertError) throw new Error('stageFromDriver.upsert_error ' + upsertError.message)

    return { staged: payload.length, fetched: fetched?.length || 0, duplicates: existingSet.size }
  } catch (err) {
    console.warn('smart_driver:stageFromDriver_error', err?.message || err)
    return { staged: 0, fetched: 0, error: err?.message || String(err) }
  }
}

async function pullProspects({ userId }) {
  // Pull staged LI contacts not yet in prospects. If the stage is empty, try
  // to prefill it via the LinkedIn driver before giving up.

  let staged = await popStagedRows(userId).catch(() => [])

  if (!staged?.length) {
    const stagedResult = await stageFromDriver({ userId })
    if (stagedResult.staged > 0) {
      staged = await popStagedRows(userId).catch(() => [])
    }
  }

  if (!staged?.length) return { pulled: 0 }

  let pulled = 0
  const prospectsHasRegion = await tableHasColumn('prospects', 'region')
  for (const c of staged) {
    // skip if already a prospect
    const filters = []
    if (c.public_id) filters.push(`public_id.eq.${c.public_id}`)
    if (c.profile_url) filters.push(`profile_url.eq.${encodeURIComponent(c.profile_url)}`)
    let exists = false
    if (filters.length) {
      const { data: existing } = await supa
        .from('prospects')
        .select('id')
        .eq('user_id', userId)
        .or(filters.join(','))
        .limit(1)
      exists = (existing || []).length > 0
    }
    if (exists) continue

    const insert = {
      user_id: userId,
      name: c.name || null,
      headline: c.headline || null,
      company: c.company || null,
      title: c.title || null,
      public_id: c.public_id || null,            // vanity id
      profile_url: c.profile_url || null,
      source: 'linkedin',
      created_at: nowIso()
    }

    if (prospectsHasRegion) {
      insert.region = c.region || null

      if (!insert.region && (insert.public_id || insert.profile_url)) {
        insert.region = await enrichRegion({
          userId,
          stageId: c.id,
          publicId: insert.public_id,
          profileUrl: insert.profile_url
        }) || null
      }
    }

    const { error: eIns } = await supa.from('prospects').insert(insert)
    if (eIns) {
      const msg = (eIns.message || '').toLowerCase()
      if (msg.includes('column') || msg.includes('property')) {
        const { first, last } = splitNameParts(insert.name)
        const fallback = {
          owner_user_id: userId,
          first_name: c.first_name || first || null,
          last_name: c.last_name || last || null,
          company: c.company || null,
          title: c.title || c.headline || null,
          linkedin_url: c.profile_url || (c.public_id ? `https://www.linkedin.com/in/${c.public_id}` : null),
          source: 'linkedin',
          status: 'new',
          created_at: nowIso()
        }
        await supa.from('prospects').insert(fallback)
        pulled++
        continue
      }
    }
    if (!eIns) pulled++
  }

  return { pulled }
}

async function upsertLead({ type, match = {}, payload }) {
  if (type === 'update') {
    let query = supa.from('leads').update(payload)
    for (const [key, value] of Object.entries(match || {})) query = query.eq(key, value)
    const attempt = await query
    if (!attempt.error) return attempt
    throw new Error('scoreLeads.upsert_error ' + (attempt.error.message || 'update_failed'))
  }

  const { user_id: userId, prospect_id: prospectId, created_at: createdAt, ...rest } = payload || {}
  if (!userId || !prospectId) {
    throw new Error('scoreLeads.upsert_error missing_user_or_prospect')
  }

  const now = nowIso()
  const refreshPayload = { ...rest, updated_at: now }
  const refreshAttempt = await supa
    .from('leads')
    .update(refreshPayload)
    .eq('user_id', userId)
    .eq('prospect_id', prospectId)
    .select('id')

  if (!refreshAttempt.error && Array.isArray(refreshAttempt.data) && refreshAttempt.data.length) {
    return refreshAttempt
  }

  const upsertPayload = {
    ...payload,
    created_at: createdAt || now,
    updated_at: now
  }

  const doUpsert = async body => supa
    .from('leads')
    .upsert(body, { onConflict: 'user_id,prospect_id', ignoreDuplicates: false })
    .select('id')
    .maybeSingle()

  let attempt = await doUpsert(upsertPayload)

  if (attempt.error) {
    const message = attempt.error.message || ''
    if (message.toLowerCase().includes('column') && message.toLowerCase().includes('score')) {
      const { score, ...fallbackPayload } = upsertPayload
      attempt = await doUpsert(fallbackPayload)
    }
    if (attempt.error) {
      throw new Error('scoreLeads.upsert_error ' + (attempt.error.message || message))
    }
  }

  return attempt
}

async function scoreLeads({ userId }) {
  // Very simple heuristic → score prospects into leads if they match your region or title keywords
  // Extend this as you like.
  const prospects = await selectProspectsForUser({ userId, limit: BATCH })
  const prospectsHasScore = await tableHasColumn('prospects', 'score')

  let scored = 0
  for (const p of (prospects || [])) {
    let region = normalizeRegion(p.region)
    if (!region && (p.public_id || p.profile_url)) {
      region = await enrichRegion({
        userId,
        prospectId: p.id,
        publicId: p.public_id,
        profileUrl: p.profile_url
      })
    }

    if (!regionMatchesAllowlist(region)) continue

    // compute a naive score
    let score = 0
    const t = `${p.title || ''} ${p.headline || ''}`.toLowerCase()
    if (t.includes('founder') || t.includes('owner') || t.includes('director') || t.includes('principal')) score += 40
    if (t.includes('marketing') || t.includes('growth') || t.includes('sales')) score += 20
    const regionText = (region || '').toLowerCase()
    if (regionText.includes('alberta') || regionText.includes('ontario')) score += 10

    if (prospectsHasScore && p.score !== score) {
      const { error: prospectUpdateError } = await supa
        .from('prospects')
        .update({ score })
        .eq('id', p.id)
      if (prospectUpdateError) {
        console.error('scoreLeads.prospect_update_error', {
          id: p.id,
          userId,
          message: prospectUpdateError.message,
          code: prospectUpdateError.code,
          details: prospectUpdateError
        })
        throw new Error('scoreLeads.prospect_update_error ' + prospectUpdateError.message)
      }
    }

    // upsert to leads
    const { data: leadRow } = await supa
      .from('leads')
      .select('id,score,quality,updated_at')
      .eq('user_id', userId)
      .eq('prospect_id', p.id) // NOTE: your prospection schema should have leads.prospect_id (uuid) FK → prospects.id
      .limit(1)
      .maybeSingle()

    if (leadRow?.id) {
      const lastTouched = leadRow.updated_at ? new Date(leadRow.updated_at).getTime() : 0
      const isFresh =
        leadRow.score === score &&
        leadRow.quality === score &&
        lastTouched &&
        Date.now() - lastTouched < 6 * 60 * 60 * 1000 // < 6h old, skip churn

      if (isFresh) continue

      await upsertLead({
        type: 'update',
        match: { id: leadRow.id },
        payload: { score, quality: score, updated_at: nowIso() }
      })
    } else {
      await upsertLead({
        type: 'insert',
        payload: {
          user_id: userId,
          prospect_id: p.id,
          score,
          quality: score,
          status: 'new',
          created_at: nowIso()
        }
      })
    }
    scored++
  }
  return { scored }
}

function withinWorkWindow() {
  try { return timePolicy.isWithinWorkWindow() } catch { return true } // if policy not present, just run
}

async function generateDrafts({ userId }) {
  // find top fresh leads without a recent draft
  const { data: leads, error: eLeads } = await supa
    .from('leads')
    .select('id,prospect_id,quality,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(BATCH)
  if (eLeads) throw new Error('generateDrafts.leads_error ' + eLeads.message)

  if (!leads?.length) return { drafted: 0 }

  // load prospect details
  const prospectIds = leads.map(l => l.prospect_id).filter(Boolean)
  if (!prospectIds.length) return { drafted: 0 }

  const prospects = await selectProspectsByIds(prospectIds)

  const map = new Map()
  for (const p of (prospects || [])) map.set(p.id, p)

  const candidates = leads
    .map(lead => map.get(lead.prospect_id))
    .filter(Boolean)

  console.log('SmartDriver[draft_candidates]', {
    candidates_total: candidates.length,
    sample: candidates.slice(0, 5).map(p => ({
      id: p.id,
      status: p.status,
      source: p.source,
      owner_user_id: p.owner_user_id,
      do_not_contact: p.do_not_contact,
      last_contacted_at: p.last_contacted_at,
      score: p.score
    }))
  })

  const finalists = candidates.filter(p => {
    const ownerMatches = p.owner_user_id === userId // require owner_user_id matches current user
    const status = typeof p.status === 'string' ? p.status.toLowerCase() : ''
    const source = typeof p.source === 'string' ? p.source.toLowerCase() : ''
    const doNotContact = p.do_not_contact === true // require do_not_contact is not true
    const lastContactedMissing = p.last_contacted_at == null // require last_contacted_at is null or undefined

    return (
      ownerMatches &&
      status === 'new' && // require status is "New"
      source === 'linkedin' && // require source is "LinkedIn"
      !doNotContact && // require not opted out of contact
      lastContactedMissing // require no prior contact
    )
  })

  console.log('SmartDriver[draft_finalists]', {
    finalists_count: finalists.length,
    sample: finalists.slice(0, 5).map(p => ({
      id: p.id,
      status: p.status,
      source: p.source,
      owner_user_id: p.owner_user_id,
      score: p.score
    }))
  })

  console.log('SmartDriver[draft_write_start]', { finalists_count: finalists.length })

  const candidateIds = new Set(finalists.map(p => p.id))

  let drafted = 0
  try {
    for (const lead of leads) {
      const p = map.get(lead.prospect_id)
      if (!p || !candidateIds.has(p.id)) continue

      const name = displayName(p)

      let region = normalizeRegion(p.region)
      if (!region && (p.public_id || p.profile_url)) {
        region = await enrichRegion({
          userId,
          prospectId: p.id,
          publicId: p.public_id,
          profileUrl: p.profile_url
        })
      }

      if (!regionMatchesAllowlist(region)) continue

      // dedupe if a recent draft exists
      const { data: recent } = await supa
        .from('drafts')
        .select('id, created_at')
        .eq('user_id', userId)
        .eq('prospect_id', p.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if ((recent || []).length) {
        const last = new Date(recent[0].created_at).getTime()
        if (Date.now() - last < 6 * 60 * 60 * 1000) continue // skip if < 6h old
      }

      // Build a brief + ask AI for a first touch
      const brief = [
        `Prospect: ${name || '—'}`,
        p.title ? `Title: ${p.title}` : null,
        p.company ? `Company: ${p.company}` : null,
        p.headline ? `Headline: ${p.headline}` : null,
        region ? `Region: ${region}` : null,
        p.profile_url ? `Profile: ${p.profile_url}` : null,
      ].filter(Boolean).join('\n')

      const prompt = `
You're an SDR for a financial advisor in Canada. Write a concise, warm LinkedIn first-touch DM (~45–70 chars for line 1; 1–2 short lines total).
Goals: say hi, reference context, ask one probing question, no pitch. Keep it human and casual; no emojis.
Context:
${brief}
Message:
`.trim()

      let body = 'Hi — quick question: what’s the #1 money thing on your mind lately?'
      try { body = (await aiComplete(prompt)).trim() } catch (_) {}

      const draftInsertResult = await supa.from('drafts').insert({
        user_id: userId,
        prospect_id: p.id,
        platform: 'linkedin',
        body,
        status: 'pending',
        created_at: nowIso()
      }).select('id')
      console.log('SmartDriver[draft_write_result]', { result: draftInsertResult })

      const { data: insertedDrafts, error: eD } = draftInsertResult
      if (eD) throw eD

      const draftsWritten = Array.isArray(insertedDrafts) ? insertedDrafts.length : (insertedDrafts ? 1 : 0)
      const draftId = Array.isArray(insertedDrafts) ? insertedDrafts[0]?.id : insertedDrafts?.id

      const { error: eApproval } = await supa.from('approvals').insert({
        user_id: userId,
        draft_id: draftId,
        status: 'pending',
        created_at: nowIso()
      })
      if (eApproval) throw eApproval

      // If within work window, also enqueue for sending (status=scheduled) so it appears in Queue tab
      if (withinWorkWindow()) {
        const { error: eQueue } = await supa.from('queue').insert({
          user_id: userId,
          prospect_id: p.id,
          platform: 'linkedin',
          body,
          status: 'scheduled',
          scheduled_at: nowIso(),
          created_at: nowIso(),
          draft_id: draftId,
          preview: body.slice(0, 120)
        })
        if (eQueue) throw eQueue
      }

      drafted += draftsWritten
    }

    const drafted_count = finalists.length

    console.log('SmartDriver[draft_finalists]', {
      drafted_count,
      drafted_actual: drafted
    })

    return { drafted: drafted_count }
  } catch (err) {
    console.error('SmartDriver[draft_error]', {
      message: err?.message,
      code: err?.code,
      detail: err
    })
    throw err
  }
}

async function oneLoopRun(tag = 'manual') {
  const users = await getActiveUsers()
  let totals = { users: users.length, pulled: 0, scored: 0, drafted: 0 }
  for (const userId of users) {
    const a = await pullProspects({ userId }); totals.pulled += a.pulled
    const b = await scoreLeads({ userId });    totals.scored += b.scored
    const c = await generateDrafts({ userId }); totals.drafted += c.drafted
  }
  console.log(`SmartDriver[${tag}]`, totals)
  return totals
}

let _timer = null
export function startSmartDriver() {
  if (_timer) return
  console.log(`SmartDriver started, interval(ms)= ${LOOP_MS}`)
  _timer = setInterval(() => {
    oneLoopRun('loop').catch(e => console.log('smart_driver:loop_error', e.message))
  }, LOOP_MS)
}

export async function runSmartDriverOnce() {
  return oneLoopRun('once')
}

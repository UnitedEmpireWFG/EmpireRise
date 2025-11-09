// backend/worker/smart_driver.js
import { supa } from '../db.js'
import { aiComplete } from '../lib/ai.js'
import { timePolicy } from '../services/time_windows.js'

const BATCH = Number(process.env.SMART_BATCH || 25)         // how many prospects per tick
const LOOP_MS = Number(process.env.SMART_LOOP_MS || 60_000) // 60s default

function nowIso() { return new Date().toISOString() }

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

async function pullProspects({ userId }) {
  // Pull staged LI contacts not yet in prospects.
  // Prefer the RPC (which handles row locking + processed_at) but gracefully
  // fall back to manual queries if the RPC is unavailable or misconfigured.

  let staged = null

  const { data: rpcRows, error: rpcError } = await supa
    .rpc('li_stage_for_user', { p_user_id: userId, p_limit: BATCH })

  if (!rpcError) {
    staged = rpcRows || []
  } else {
    const msg = rpcError.message || ''
    // If the RPC exists but is misconfigured we still want to proceed.
    console.warn('smart_driver:pullProspects rpc_error', msg)

    const { data, error: fallbackError } = await supa
      .from('li_contacts_stage')
      .select('id,user_id,name,headline,company,title,region,public_id,profile_url,created_at')
      .eq('user_id', userId)
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .limit(BATCH)

    if (fallbackError) throw new Error('pullProspects.stage_error ' + fallbackError.message)
    staged = data || []

    const ids = staged.map(row => row.id).filter(Boolean)
    if (ids.length) {
      const { error: markError } = await supa
        .from('li_contacts_stage')
        .update({ processed_at: nowIso() })
        .in('id', ids)
      if (markError) throw new Error('pullProspects.mark_error ' + markError.message)
    }
  }

  if (!staged?.length) return { pulled: 0 }

  let pulled = 0
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
      region: c.region || null,
      public_id: c.public_id || null,            // vanity id
      profile_url: c.profile_url || null,
      source: 'linkedin',
      created_at: nowIso()
    }
    const { error: eIns } = await supa.from('prospects').insert(insert)
    if (!eIns) pulled++
  }

  return { pulled }
}

async function scoreLeads({ userId }) {
  // Very simple heuristic → score prospects into leads if they match your region or title keywords
  // Extend this as you like.
  const { data: prospects, error: ePros } = await supa
    .from('prospects')
    .select('id,name,headline,company,title,region')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(BATCH)
  if (ePros) throw new Error('scoreLeads.load_error ' + ePros.message)

  let scored = 0
  for (const p of (prospects || [])) {
    // compute a naive score
    let score = 0
    const t = `${p.title || ''} ${p.headline || ''}`.toLowerCase()
    if (t.includes('founder') || t.includes('owner') || t.includes('director') || t.includes('principal')) score += 40
    if (t.includes('marketing') || t.includes('growth') || t.includes('sales')) score += 20
    if ((p.region || '').toLowerCase().includes('alberta') || (p.region || '').toLowerCase().includes('ontario')) score += 10

    // upsert to leads
    const { data: leadRow } = await supa
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .eq('prospect_id', p.id) // NOTE: your prospection schema should have leads.prospect_id (uuid) FK → prospects.id
      .limit(1)
      .maybeSingle()

    if (leadRow?.id) {
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

async function upsertLead({ type, match = {}, payload }) {
  const exec = async values => {
    if (type === 'update') {
      let query = supa.from('leads').update(values)
      for (const [key, value] of Object.entries(match || {})) query = query.eq(key, value)
      return query
    }
    return supa.from('leads').insert(values)
  }

  const attempt = await exec(payload)
  if (!attempt.error) return attempt

  const message = attempt.error.message || ''
  if (message.toLowerCase().includes('column') && message.toLowerCase().includes('score')) {
    const retryPayload = { ...payload }
    delete retryPayload.score
    const retry = await exec(retryPayload)
    if (!retry.error) return retry
    throw new Error('scoreLeads.upsert_error ' + retry.error.message)
  }

  throw new Error('scoreLeads.upsert_error ' + message)
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

  const { data: prospects, error: eLoadP } = await supa
    .from('prospects')
    .select('id,name,headline,company,title,region,profile_url')
    .in('id', prospectIds)
  if (eLoadP) throw new Error('generateDrafts.prospects_error ' + eLoadP.message)

  const map = new Map()
  for (const p of (prospects || [])) map.set(p.id, p)

  let drafted = 0
  for (const lead of leads) {
    const p = map.get(lead.prospect_id)
    if (!p) continue

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
      `Prospect: ${p.name || '—'}`,
      p.title ? `Title: ${p.title}` : null,
      p.company ? `Company: ${p.company}` : null,
      p.headline ? `Headline: ${p.headline}` : null,
      p.region ? `Region: ${p.region}` : null,
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

    // Insert draft → create approval row for UI review
    const { data: dIns, error: eD } = await supa.from('drafts').insert({
      user_id: userId,
      prospect_id: p.id,
      platform: 'linkedin',
      body,
      status: 'pending',
      created_at: nowIso()
    }).select('id').single()
    if (eD) continue

    await supa.from('approvals').insert({
      user_id: userId,
      draft_id: dIns.id,
      status: 'pending',
      created_at: nowIso()
    })

    // If within work window, also enqueue for sending (status=scheduled) so it appears in Queue tab
    if (withinWorkWindow()) {
      await supa.from('queue').insert({
        user_id: userId,
        prospect_id: p.id,
        platform: 'linkedin',
        body,
        status: 'scheduled',
        scheduled_at: nowIso(),
        created_at: nowIso(),
        draft_id: dIns.id,
        preview: body.slice(0, 120)
      })
    }

    drafted++
  }
  return { drafted }
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

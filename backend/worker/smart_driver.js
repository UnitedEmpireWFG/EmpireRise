// backend/worker/smart_driver.js
import { supa } from '../db.js'
import { timePolicy } from '../services/time_windows.js'

const LOOP_MS = Number(process.env.SMART_DRIVER_INTERVAL_MS || 60_000) // 60s

function defaultWithinWorkWindow(cfg, now = new Date()) {
  // cfg: { tz, days:[1..5], start:'09:00', end:'18:00', quietEnabled:bool, ... }
  try {
    const tz = cfg?.tz || 'UTC'
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short'
    })
    const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
    const hhmm = `${parts.hour?.padStart(2,'0')}:${parts.minute?.padStart(2,'0')}`
    const weekdayMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }
    const dow = weekdayMap[parts.weekday] ?? now.getDay()
    const allowedDays = Array.isArray(cfg?.days) ? cfg.days : [1,2,3,4,5] // Mon-Fri
    const start = cfg?.start || '09:00'
    const end = cfg?.end || '18:00'
    const isDay = allowedDays.includes(dow)
    const isTime = hhmm >= start && hhmm <= end
    // If quietEnabled=false, always allow; if true, restrict to window.
    return cfg?.quietEnabled ? (isDay && isTime) : true
  } catch {
    return true
  }
}

function withinWorkWindow() {
  const hasFn = typeof timePolicy?.isWithinWorkWindow === 'function'
  return hasFn ? timePolicy.isWithinWorkWindow(new Date()) : defaultWithinWorkWindow(timePolicy?._cfg, new Date())
}

async function pullProspects(userId) {
  // Move staged LI contacts into prospects if not already present.
  try {
    // read staged rows
    const { data: staged, error: stgErr } = await supa
      .from('li_contacts_stage')
      .select('*')
      .eq('user_id', userId)
      .limit(200)
    if (stgErr) throw new Error(`stage_load ${stgErr.message}`)
    if (!staged?.length) return { imported: 0 }

    let imported = 0
    for (const row of staged) {
      // Check if a prospect exists by (user_id, public_id) or fallback on full_name+company
      const { data: exists } = await supa
        .from('prospects')
        .select('id')
        .eq('user_id', userId)
        .or([
          row.public_id ? `public_id.eq.${row.public_id}` : null,
          (row.full_name && row.company) ? `and(full_name.eq.${row.full_name},company.eq.${row.company})` : null
        ].filter(Boolean).join(','))
        .limit(1)
        .maybeSingle()

      if (!exists) {
        const title = row.headline || null
        const insert = {
          user_id: userId,
          public_id: row.public_id || null,
          full_name: row.full_name || null,
          title,
          company: row.company || null,
          region: row.region || null,
          source: 'linkedin',
          status: 'new',
          meta: row.raw || {}
        }
        const { error: insErr } = await supa.from('prospects').insert(insert)
        if (!insErr) imported++
      }
    }
    return { imported }
  } catch (e) {
    console.log('pullProspects:stage_error', e.message)
    return { imported: 0, error: e.message }
  }
}

function scoreOneProspect(p) {
  // toy scorer: boost title/region matches
  const wantRegion = (process.env.DEFAULT_REGION || '').toLowerCase()
  const wantTitle = (process.env.DEFAULT_TITLE || '').toLowerCase()
  const title = (p.title || p.headline || '').toLowerCase()
  const region = (p.region || '').toLowerCase()

  let s = 50
  if (wantRegion && region.includes(wantRegion)) s += 20
  if (wantTitle && title.includes(wantTitle)) s += 20
  if (p.company) s += 5
  if (p.meta?.mutuals) s += Math.min(5, (p.meta.mutuals|0))
  return Math.max(1, Math.min(99, s))
}

async function scoreLeads(userId) {
  try {
    // load unscored prospects
    const { data: prospects, error } = await supa
      .from('prospects')
      .select('id, user_id, full_name, title, headline, company, region, meta, score')
      .eq('user_id', userId)
      .is('archived_at', null)
      .or('score.is.null,score.lt.1')
      .limit(200)
    if (error) throw new Error(error.message)
    if (!prospects?.length) return { scored: 0 }

    let scored = 0
    for (const p of prospects) {
      const next = scoreOneProspect(p)
      const { error: upErr } = await supa
        .from('prospects')
        .update({ score: next, updated_at: new Date().toISOString() })
        .eq('id', p.id)
        .eq('user_id', userId)
      if (!upErr) scored++
    }
    return { scored }
  } catch (e) {
    console.log('scoreLeads:load_error', e.message)
    return { scored: 0, error: e.message }
  }
}

async function enqueueDrafts(userId) {
  try {
    // pull top prospects without drafts in queue
    const { data: tops, error } = await supa
      .from('prospects')
      .select('id, user_id, full_name, title, headline, company, region, score, status')
      .eq('user_id', userId)
      .gte('score', 70)
      .neq('status', 'contacted')
      .limit(30)
    if (error) throw new Error(error.message)

    let enq = 0
    for (const p of tops || []) {
      // check if already queued
      const { data: q } = await supa
        .from('queue')
        .select('id')
        .eq('user_id', userId)
        .eq('prospect_id', p.id)
        .in('status', ['scheduled','draft','pending'])
        .limit(1)
      if (q?.length) continue

      const name = p.full_name || 'there'
      const role = p.title || p.headline || ''
      const opener = `Hey ${name.split(' ')[0]}, loved your work around ${role || 'your area'}.`
      const body = `Curious if you’re open to a quick chat—I've got an idea that could fit what you're doing at ${p.company || 'your team'}.`

      const draft = `${opener} ${body}`

      const { error: insErr } = await supa.from('queue').insert({
        user_id: userId,
        prospect_id: p.id,
        channel: 'linkedin',
        type: 'dm',
        status: 'draft',
        payload: { text: draft }
      })
      if (!insErr) enq++
    }
    return { enqueued: enq }
  } catch (e) {
    console.log('enqueue:load_error', e.message)
    return { enqueued: 0, error: e.message }
  }
}

async function sendIfWindow(userId) {
  if (!withinWorkWindow()) return { sent: 0, skipped: true }
  // Move a few drafts to 'scheduled' or send immediately (depending on your sender)
  const { data: drafts, error } = await supa
    .from('queue')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .eq('channel', 'linkedin')
    .limit(10)
  if (error || !drafts?.length) return { sent: 0 }

  let cnt = 0
  for (const d of drafts) {
    const { error: upErr } = await supa
      .from('queue')
      .update({ status: 'scheduled', scheduled_for: new Date().toISOString() })
      .eq('id', d.id)
    if (!upErr) cnt++
  }
  return { sent: cnt }
}

async function loopOnce() {
  // Choose the *current* authenticated user for single-user app.
  // If multi-tenant, iterate users here.
  const { data: me } = await supa.rpc('get_current_user_id') // optional; if not defined, fallback
  const userId = me?.id || process.env.DEBUG_USER_ID // provide DEBUG_USER_ID if needed

  if (!userId) return

  const a = await pullProspects(userId)
  const b = await scoreLeads(userId)
  const c = await enqueueDrafts(userId)
  const d = await sendIfWindow(userId)

  if (a?.error) console.log('pullProspects:error', a.error)
  if (b?.error) console.log('scoreLeads:error', b.error)
  if (c?.error) console.log('enqueue:error', c.error)
  if (d?.skipped) console.log('send:skipped (outside work window)')

  // Optional: concise heartbeat
  console.log(`SmartDriver tick uid=${userId} imported=${a.imported||0} scored=${b.scored||0} enqueued=${c.enqueued||0} movedToScheduled=${d.sent||0}`)
}

export function startSmartDriver() {
  const ms = LOOP_MS
  console.log('SmartDriver started, interval(ms)=', ms)
  setInterval(() => loopOnce().catch(e => console.log('smart_driver:loop_error', e.message)), ms)
}
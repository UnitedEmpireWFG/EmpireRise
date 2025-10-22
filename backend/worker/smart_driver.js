// backend/worker/smart_driver.js
import { supa, supaAdmin } from '../db.js'
import { timePolicy } from '../services/time_windows.js'
import { generateIntroMessage, generateNurtureFollowup } from '../lib/ai_messages.js'
import { tickLinkedInSender } from './li_dm_sender.js'

// tiny guard: don't hammer DB if many users
const SLEEP = (ms) => new Promise(r => setTimeout(r, ms))

async function getActiveUsers() {
  // any user that has a linkedin_access_token is "active"
  const { data, error } = await supaAdmin
    .from('app_settings')
    .select('user_id, linkedin_access_token')
    .not('linkedin_access_token', 'is', null)
    .limit(500)
  if (error) { console.log('smart_driver:getActiveUsers', error.message); return [] }
  return data?.map(x => x.user_id) || []
}

/** 1) Pull: import connections (seed) into prospects table if missing */
async function pullProspectsFor(userId, limit = 50) {
  // Assumes you already have an importer that fetches connections via cookies/API.
  // We read from your existing storage (wherever you stash LI contacts) — for demo,
  // we assume a RPC or a staging view exists. If not, replace with your real fetcher.
  try {
    // Example: suppose you have a materialized view "li_contacts_stage"
    // columns: user_id, li_profile_id, full_name, headline, location, company, title
    const { data, error } = await supaAdmin
      .from('li_contacts_stage')
      .select('li_profile_id, full_name, headline, location, company, title')
      .eq('user_id', userId)
      .order('full_name', { ascending: true })
      .limit(limit)

    if (error) { console.log('pullProspects:stage_error', error.message); return 0 }
    if (!data || !data.length) return 0

    // upsert into prospects
    const rows = data.map(x => ({
      user_id: userId,
      li_profile_id: x.li_profile_id,
      full_name: x.full_name,
      headline: x.headline,
      location: x.location,
      company: x.company,
      title: x.title,
      source: 'contacts',
      kind: 'connection'
    }))

    const { error: upErr } = await supaAdmin
      .from('prospects')
      .upsert(rows, { onConflict: 'user_id,li_profile_id' })
    if (upErr) { console.log('pullProspects:upsert_error', upErr.message); return 0 }

    return rows.length
  } catch (e) {
    console.log('pullProspects:error', e.message)
    return 0
  }
}

/** 2) Score leads: simple heuristic that’s actually useful */
function scoreProspect(p) {
  let s = 0
  if (p.title) {
    const t = p.title.toLowerCase()
    if (/\b(founder|owner|ceo|partner|principal)\b/.test(t)) s += 30
    if (/\b(lead|head|director|vp|svp|cxo)\b/.test(t)) s += 20
  }
  if (p.company && p.company.length >= 3) s += 10
  if (p.location && /canada|toronto|edmonton|vancouver|calgary/i.test(p.location)) s += 10
  if (p.headline && /growth|sales|marketing|revenue|hiring/i.test(p.headline)) s += 10
  return s
}

async function scoreLeadsFor(userId, batch = 100) {
  const { data, error } = await supaAdmin
    .from('prospects')
    .select('id, full_name, title, company, location, headline, score')
    .eq('user_id', userId)
    .in('status', ['new', 'review'])
    .order('updated_at', { ascending: true })
    .limit(batch)
  if (error) { console.log('scoreLeads:load_error', error.message); return 0 }
  if (!data?.length) return 0

  const updates = data.map(p => ({ id: p.id, score: scoreProspect(p), updated_at: new Date().toISOString() }))
  const { error: upErr } = await supaAdmin.from('prospects').upsert(updates)
  if (upErr) { console.log('scoreLeads:upsert_error', upErr.message); return 0 }
  return updates.length
}

/** 3) Draft & enqueue messages */
async function draftAndEnqueueFor(userId, maxDrafts = 20) {
  // pick best un-messaged prospects
  const { data: prospects, error } = await supaAdmin
    .from('prospects')
    .select('id, li_profile_id, full_name, title, company, location, headline, status')
    .eq('user_id', userId)
    .eq('status', 'new')
    .order('score', { ascending: false })
    .limit(maxDrafts)

  if (error) { console.log('enqueue:load_error', error.message); return 0 }
  if (!prospects?.length) return 0

  const enqueued = []
  for (const p of prospects) {
    const ctx = {
      name: p.full_name,
      title: p.title,
      company: p.company,
      headline: p.headline,
      location: p.location
    }
    const text = await generateIntroMessage(ctx)
    if (!text) continue

    // enqueue
    const { error: qErr, data: qRows } = await supaAdmin
      .from('outbound_queue')
      .insert({
        user_id: userId,
        channel: 'linkedin_dm',
        to_profile_id: p.li_profile_id || null,
        prospect_id: p.id,
        message_text: text,
        status: 'scheduled'
      })
      .select('id')

    if (qErr) { console.log('enqueue:insert_error', qErr.message); continue }

    // mark prospect as "messaged" (but still waiting to be sent)
    await supaAdmin.from('prospects').update({
      status: 'messaged',
      updated_at: new Date().toISOString()
    }).eq('id', p.id)

    enqueued.push(qRows?.[0]?.id)
    // small spacing to avoid bursting token usage
    await SLEEP(80)
  }

  return enqueued.length
}

/** 4) Dispatch (use your existing sender loop) */
async function dispatchNow() {
  try {
    await tickLinkedInSender()
  } catch (e) {
    console.log('dispatchNow:sender_error', e.message)
  }
}

/** Orchestrate per user in a pass */
async function runPassFor(userId) {
  // Pull
  const pulled = await pullProspectsFor(userId, 80)
  if (pulled) console.log('smart_driver:pulled', userId, pulled)

  // Score
  const scored = await scoreLeadsFor(userId, 120)
  if (scored) console.log('smart_driver:scored', userId, scored)

  // Draft
  const drafted = await draftAndEnqueueFor(userId, 30)
  if (drafted) console.log('smart_driver:drafted', userId, drafted)

  // Dispatch in work window only
  if (timePolicy.isWithinWorkWindow(new Date())) {
    await dispatchNow()
  } else {
    console.log('smart_driver:outside_work_window')
  }
}

/** Public starter */
export function startSmartDriver() {
  // run frequently but light
  const everyMs = Math.max(30_000, Number(process.env.SMART_DRIVER_INTERVAL_MS || 60_000))
  const loop = async () => {
    try {
      const users = await getActiveUsers()
      for (const uid of users) {
        await runPassFor(uid)
        await SLEEP(150) // tiny breath between users
      }
    } catch (e) {
      console.log('smart_driver:loop_error', e.message)
    } finally {
      setTimeout(loop, everyMs)
    }
  }
  console.log('SmartDriver started, interval(ms)=', everyMs)
  loop()
}
// backend/worker/scheduler.js
// Supabase scheduler with target driven pacing, hot hour boost, and per platform caps
import { supa } from "../db.js"
import { sendMessage as sendToPlatform } from "../lib/send.js"
import { sendWebPush } from "../lib/webpush.js"

const TICK_MS = 15000

async function getSettings() {
  const { data } = await supa
    .from("app_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle()

  const s = data || {}
  return {
    daily_cap: s.daily_cap ?? 30,
    per_tick: s.per_tick ?? 3,
    ticks_per_day: s.ticks_per_day ?? 6,
    weekly_target_appts: s.weekly_target_appts ?? s.weekly_target ?? 5,
    rate_booked: s.rate_booked ?? 0.02,
    platform_mix: s.platform_mix || { linkedin: 100 },
    cap_linkedin: s.cap_linkedin ?? null,
    cap_instagram: s.cap_instagram ?? null,
    cap_facebook: s.cap_facebook ?? null
  }
}

function startOfTodayIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

async function sentTodayCount() {
  const todayIso = startOfTodayIso()
  const { count } = await supa
    .from("sent_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayIso)
  return count || 0
}

async function sentTodayByPlatform() {
  const todayIso = startOfTodayIso()
  const { data, error } = await supa
    .from("sent_log")
    .select("platform")
    .gte("created_at", todayIso)

  if (error) return {}

  const map = {}
  for (const row of data || []) {
    const p = row.platform || "unknown"
    map[p] = (map[p] || 0) + 1
  }
  return map
}

async function sentWeekCount() {
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString()
  const { count } = await supa
    .from("sent_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", weekAgo)
  return count || 0
}

async function fetchDueQueueByPlatform(platform, limit) {
  const { data, error } = await supa
    .from("queue")
    .select("*")
    .in("status", ["approved", "ready", "scheduled"])
    .eq("platform", platform)
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit)
  if (error) return []
  return data || []
}

async function markSent(q) {
  const now = new Date().toISOString()
  await supa.from("queue").update({ status: "sent", sent_at: now }).eq("id", q.id)
  await supa.from("sent_log").insert({
    queue_id: q.id,
    platform: q.platform,
    user_id: q.user_id,
    contact_id: q.contact_id,
    created_at: now
  })
}

function safeJson(x) {
  if (!x) return null
  if (typeof x === "object") return x
  try { return JSON.parse(x) } catch { return null }
}

async function listPushSubs(limit = 100) {
  const { data, error } = await supa.from("push_subs").select("*").limit(limit)
  if (error) return []
  return (data || []).map(row => {
    if (row.raw) return row.raw
    return { endpoint: row.endpoint, keys: row.keys || {} }
  })
}

async function notifyPush(title, body) {
  const subs = await listPushSubs(100)
  await Promise.all(subs.map(sub => sendWebPush(sub, { title, body }).catch(() => null)))
}

// target driven pacing helper
function projectedShortfall(settings, sentSoFarWeek) {
  const needWeek = Math.ceil((settings.weekly_target_appts ?? 5) / (settings.rate_booked ?? 0.02))
  const today = new Date()
  const dow = today.getDay()
  const daysDone = Math.max(1, dow === 0 ? 1 : dow)
  const shouldHave = Math.ceil(needWeek * (daysDone / 7))
  const diff = shouldHave - sentSoFarWeek
  return diff > 0 ? diff : 0
}

// hot hour boost from stats_hot_hours
async function hotHourBoost() {
  const hour = new Date().getHours()
  const { data } = await supa
    .from("stats_hot_hours")
    .select("hour,score")
    .eq("hour", hour)
    .maybeSingle()
  if (!data) return 1
  return Math.max(0.6, Math.min(1.4, 0.6 + (data.score / 100) * 0.8))
}

function computePlatformCaps(settings) {
  const mix = settings.platform_mix || { linkedin: 100 }
  const totalPct = Object.values(mix).reduce((a, b) => a + Number(b || 0), 0) || 100
  const dailyCap = settings.daily_cap || 30

  const base = {}
  for (const [p, pct] of Object.entries(mix)) {
    const share = Math.max(0, Math.floor((dailyCap * Number(pct || 0)) / totalPct))
    base[p] = share
  }

  const hardCaps = {
    linkedin: settings.cap_linkedin ?? null,
    instagram: settings.cap_instagram ?? null,
    facebook: settings.cap_facebook ?? null
  }

  for (const p of Object.keys(base)) {
    const cap = hardCaps[p]
    if (cap != null) base[p] = Math.min(base[p], cap)
  }

  return base
}

function distributeBatch(perTick, remainingToday, perPlatRemaining) {
  const plats = Object.keys(perPlatRemaining)
  if (plats.length === 0) return []

  const totalRemaining = plats.reduce((a, p) => a + perPlatRemaining[p], 0)
  if (totalRemaining === 0) return []

  const batch = Math.min(perTick, remainingToday)
  const plan = []

  let assigned = 0
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i]
    const share = Math.floor((batch * perPlatRemaining[p]) / totalRemaining)
    const qty = Math.min(share, perPlatRemaining[p])
    if (qty > 0) {
      plan.push({ platform: p, qty })
      assigned += qty
    }
  }

  let leftover = batch - assigned
  if (leftover > 0) {
    const order = plats.sort((a, b) => perPlatRemaining[b] - perPlatRemaining[a])
    for (const p of order) {
      if (leftover === 0) break
      if (perPlatRemaining[p] <= 0) continue
      const found = plan.find(x => x.platform === p)
      if (found) found.qty += 1
      else plan.push({ platform: p, qty: 1 })
      leftover -= 1
    }
  }

  return plan.filter(x => x.qty > 0)
}

export async function runTick() {
  const settings = await getSettings()

  const sentTodayTotal = await sentTodayCount()
  const remainingToday = Math.max(0, settings.daily_cap - sentTodayTotal)
  if (remainingToday === 0) return

  const boost = await hotHourBoost()

  let perTick = settings.per_tick || 3

  const sentWeek = await sentWeekCount()
  const shortfall = projectedShortfall(settings, sentWeek || 0)
  if (shortfall > 0) {
    const ticks = Math.max(1, settings.ticks_per_day ?? 6)
    const safePerTick = Math.max(1, Math.floor((settings.daily_cap ?? 30) / ticks))
    perTick = Math.min(safePerTick, perTick + 1)
    perTick = Math.min(safePerTick, Math.max(1, Math.floor(perTick * boost)))
  } else {
    perTick = Math.max(1, Math.floor(perTick * boost))
  }

  const capsPerPlat = computePlatformCaps(settings)
  const usedTodayPerPlat = await sentTodayByPlatform()

  const remainingPerPlat = {}
  for (const [p, cap] of Object.entries(capsPerPlat)) {
    const used = usedTodayPerPlat[p] || 0
    const rem = Math.max(0, cap - used)
    if (rem > 0) remainingPerPlat[p] = rem
  }
  if (Object.keys(remainingPerPlat).length === 0) return

  const plan = distributeBatch(perTick, remainingToday, remainingPerPlat)
  if (plan.length === 0) return

  const due = []
  for (const slice of plan) {
    const rows = await fetchDueQueueByPlatform(slice.platform, slice.qty)
    for (const r of rows) due.push(r)
  }
  if (due.length === 0) return

  for (const q of due) {
    const payload = safeJson(q.payload)
    try {
      await sendToPlatform({
        platform: q.platform,
        user_id: q.user_id,
        contact_id: q.contact_id,
        payload
      })
      await markSent(q)
      await new Promise(r => setTimeout(r, 400 + Math.random() * 600))
    } catch (e) {
      await supa
        .from("queue")
        .update({ status: "error", error: e?.message || "send_failed" })
        .eq("id", q.id)
    }
  }

  await notifyPush("EmpireRise", `Sent ${due.length} message(s)`)
}

export function startScheduler() {
  console.log("[scheduler] starting tick", TICK_MS, "ms")
  setInterval(runTick, TICK_MS)
  runTick()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startScheduler()
}

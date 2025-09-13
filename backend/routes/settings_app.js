import { Router } from "express"
import { supa } from "../db.js"

const r = Router()

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const clampPct = v => Math.max(0, Math.min(100, num(v)))

function computePlan(s) {
  // Inputs
  const weeklyTarget = num(s.weekly_target_appts ?? 5)
  const bookedRate   = num(s.rate_booked ?? 0.02) || 0.02   // conservative
  const ticksPerDay  = Math.max(1, num(s.ticks_per_day ?? 6))
  const dailyCap     = Math.max(0, num(s.daily_cap ?? 30))

  // Mix, %s
  const mix = s.platform_mix || { linkedin:50, instagram:30, facebook:20 }
  const mixLI = clampPct(mix.linkedin)
  const mixIG = clampPct(mix.instagram)
  const mixFB = clampPct(mix.facebook)
  const totalMix = mixLI + mixIG + mixFB || 100
  const fLI = mixLI / totalMix
  const fIG = mixIG / totalMix
  const fFB = mixFB / totalMix

  // Per-platform safe caps
  const capLI = Math.max(0, num(s.cap_linkedin ?? 80))
  const capIG = Math.max(0, num(s.cap_instagram ?? 60))
  const capFB = Math.max(0, num(s.cap_facebook ?? 60))

  // Messages needed to hit target (worst-case chain uses bookedRate only)
  const needWeek = Math.ceil(weeklyTarget / bookedRate)
  const needPerDay = Math.ceil(needWeek / 7)

  // Hard app daily cap gate
  const capByDailyCap = dailyCap > 0 ? dailyCap : Infinity

  // Respect mix: the total per-day you can send without breaking caps
  // total <= min( capLI / fLI, capIG / fIG, capFB / fFB ) when fX > 0
  const maxByMix = Math.min(
    fLI > 0 ? Math.floor(capLI / fLI) : Infinity,
    fIG > 0 ? Math.floor(capIG / fIG) : Infinity,
    fFB > 0 ? Math.floor(capFB / fFB) : Infinity
  )

  // Global allowed per-day = min(app cap, mix caps)
  const allowedPerDay = Math.min(capByDailyCap, maxByMix)

  // Suggested send per-tick
  const suggestedPerTick = Math.max(1, Math.ceil(allowedPerDay / ticksPerDay))

  // Allocation per platform at allowedPerDay using the mix
  const allocLI = Math.min(capLI, Math.round(allowedPerDay * fLI))
  const allocIG = Math.min(capIG, Math.round(allowedPerDay * fIG))
  const allocFB = Math.min(capFB, Math.round(allowedPerDay * fFB))

  // Status
  const capExceeded = needPerDay > allowedPerDay
  const shortfall = capExceeded ? (needPerDay - allowedPerDay) : 0

  return {
    needSent: needWeek,
    perDayNeeded: needPerDay,
    perDayAllowed: allowedPerDay,
    perTick: suggestedPerTick,
    capExceeded,
    shortfall,
    mix: { linkedin: mixLI, instagram: mixIG, facebook: mixFB },
    caps: { linkedin: capLI, instagram: capIG, facebook: capFB },
    perPlatform: { linkedin: allocLI, instagram: allocIG, facebook: allocFB }
  }
}

// GET current settings + safe plan
r.get("/", async (_req, res) => {
  try {
    const { data, error } = await supa
      .from("app_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
    if (error) throw error
    const settings = data || {}
    return res.json({ ok: true, settings, plan: computePlan(settings) })
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message || "load_failed" })
  }
})

// POST save settings
r.post("/", async (req, res) => {
  try {
    const body = req.body || {}

    // Normalize platform mix
    const mix = body.platform_mix || {}
    let li = clampPct(mix.linkedin ?? 50)
    let ig = clampPct(mix.instagram ?? 30)
    let fb = clampPct(mix.facebook ?? 20)
    const sum = li + ig + fb || 100
    li = Math.round((li / sum) * 100)
    ig = Math.round((ig / sum) * 100)
    fb = Math.max(0, 100 - li - ig)

    const payload = {
      id: 1,
      daily_cap:            num(body.daily_cap ?? 30),
      weekly_target_appts:  num(body.weekly_target_appts ?? 5),
      per_tick:             num(body.per_tick ?? 3),
      ticks_per_day:        num(body.ticks_per_day ?? 6),
      rate_open:            num(body.rate_open ?? 0.25),
      rate_reply:           num(body.rate_reply ?? 0.08),
      rate_qualified:       num(body.rate_qualified ?? 0.03),
      rate_booked:          num(body.rate_booked ?? 0.02),
      li_batch_cron:        (body.li_batch_cron ?? "0 9 * * *") + "",
      li_batch_enabled:     !!body.li_batch_enabled,
      platform_mix:         { linkedin: li, instagram: ig, facebook: fb },
      cap_linkedin:         num(body.cap_linkedin ?? 80),
      cap_instagram:        num(body.cap_instagram ?? 60),
      cap_facebook:         num(body.cap_facebook ?? 60),
      updated_at:           new Date().toISOString()
    }

    const { data, error } = await supa
      .from("app_settings")
      .upsert(payload, { onConflict: "id" })
      .select()
      .eq("id", 1)
      .maybeSingle()
    if (error) throw error

    const plan = computePlan(data)
    return res.json({ ok: true, settings: data, plan })
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message || "save_failed" })
  }
})

export default r

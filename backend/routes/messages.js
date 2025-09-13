// backend/routes/messages.js
import { Router } from "express"
import { supa } from "../db.js"
import { aiComplete } from "../lib/ai.js"

const r = Router()

// ------------------------------------------------------------------
// GET /api/messages/drafts
// ------------------------------------------------------------------
r.get("/drafts", async (_req, res) => {
  try {
    const { data, error } = await supa
      .from("drafts")
      .select("id,platform,preview,body,scheduled_at,contact_id,status,created_at")
      .order("created_at", { ascending: false })
    if (error) throw new Error(error.message)
    res.json({ ok: true, drafts: data || [] })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ------------------------------------------------------------------
// POST /api/messages/generate
// Prioritizes unanswered 30d, new connections 14d, then recents.
// Canada only, status=pending
// ------------------------------------------------------------------
r.post("/generate", async (req, res) => {
  try {
    const {
      platforms = ["instagram","facebook","linkedin"],
      profile = "client",
      limit = 10,
      stage_in = [],
      tag_in = []
    } = req.body || {}

    const country = process.env.DEFAULT_COUNTRY || "CA"
    const picks = []
    const addUnique = arr => {
      for (const c of arr || []) {
        if (picks.find(x => x.id === c.id)) continue
        picks.push(c)
        if (picks.length >= limit) break
      }
    }

    // A) unanswered last 30 days
    const unansweredResp = await supa.rpc("contacts_unanswered", {
      p_platforms: platforms,
      p_country: country,
      p_days: 30,
      p_limit: limit
    })
    addUnique(unansweredResp?.data || [])

    // B) new connections 14 days
    if (picks.length < limit) {
      const { data: newcon } = await supa
        .from("contacts")
        .select("id, name, platform, handle, stage, tags, country, created_at")
        .in("platform", platforms).eq("country", country)
        .eq("do_not_contact", false)
        .gte("created_at", new Date(Date.now() - 14*86400000).toISOString())
        .order("created_at",{ascending:false})
        .limit(limit)
      addUnique(newcon)
    }

    // C) recent as fallback
    if (picks.length < limit) {
      let q = supa
        .from("contacts")
        .select("id, name, platform, handle, stage, tags, country")
        .in("platform", platforms).eq("country", country)
        .eq("do_not_contact", false)
        .order("updated_at",{ascending:false})
        .limit(limit)
      if (stage_in?.length) q = q.in("stage", stage_in)
      if (tag_in?.length)   q = q.overlaps("tags", tag_in)
      const { data: recents } = await q
      addUnique(recents)
    }

    const contacts = picks.slice(0, limit)
    const nowIso = new Date().toISOString()
    const drafts = []

    for (const c of contacts) {
      const { data: ix } = await supa
        .from("interactions")
        .select("type, direction, body, created_at")
        .eq("contact_id", c.id)
        .order("created_at", { ascending: false })
        .limit(5)

      const stageGoal = {
        prospect:   "Warm opener and one small, relevant question. No pitch.",
        warm:       "Follow the thread with a specific layered follow up. No pitch.",
        opportunity:"Light nudge toward a brief call if it feels natural.",
        client:     "Helpful check in with a tiny win."
      }[c.stage || "prospect"]

      const prompt = [
        "You are an outreach assistant for a Canadian financial advisor.",
        `Platform: ${c.platform}. Name: ${c.name || ""}. Handle: ${c.handle || ""}.`,
        `Profile: ${profile}. Stage: ${c.stage || "prospect"}. Goal: ${stageGoal}`,
        "Rules: short, human, reflective listening, Canadian spelling, no emojis, no pitch.",
        `Recent interactions JSON: ${JSON.stringify(ix || [])}`,
        "Output: ONE DM under 450 chars."
      ].join("\n")

      const body = await aiComplete(prompt)

      drafts.push({
        user_id: "default",
        contact_id: c.id,
        platform: c.platform,
        body,
        preview: body.slice(0, 140),
        status: "pending",
        created_at: nowIso,
        scheduled_at: null
      })
    }

    if (!drafts.length) return res.json({ ok: true, drafts: [] })
    const ins = await supa.from("drafts").insert(drafts).select("*")
    if (ins.error) throw new Error(ins.error.message)
    res.json({ ok: true, drafts: ins.data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

r.post('/variants/generate', async (req, res) => {
  try {
    const base = req.body || {}
    const v1 = await generateMessage(base)
    const v2 = await generateMessage({ ...base, tweak: 'alt' })
    if (!v1.ok && !v2.ok) return res.json({ ok: false, error: v1.error || v2.error })
    res.json({ ok: true, items: [v1.text || '', v2.text || ''].filter(Boolean) })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

export default r

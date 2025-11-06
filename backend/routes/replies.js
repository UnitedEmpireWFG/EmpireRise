import express from "express"
import { supabase } from "../lib/supabase.js"

const router = express.Router()

function getUserId(req) {
  return req.user?.id || req.user?.user_id || req.user?.sub || null
}

// POST /api/replies/ingest
// Body: { lead_id, platform, text }
router.post("/ingest", async (req, res) => {
  try {
    const { lead_id, platform, text } = req.body || {}
    if (!lead_id || !platform || !text) {
      return res.status(400).json({ ok: false, error: "lead_id, platform, text required" })
    }

    const row = {
      lead_id,
      platform,
      text,
      from_lead: true,
      user_id: getUserId(req),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { error: rerr } = await supabase
      .from("replies")
      .insert([row])
    if (rerr) throw rerr

    await supabase.from("leads").update({ last_reply_at: new Date().toISOString() }).eq("id", lead_id)
    await supabase.from("timeline").insert([{ lead_id, kind: "reply", detail: text }])
    await supabase
      .from("messages")
      .update({ status: "paused" })
      .eq("lead_id", lead_id)
      .in("status", ["approved","scheduled"])

    return res.json({ ok: true })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) })
  }
})

// GET /api/replies/list
router.get("/list", async (req, res) => {
  try {
    const userId = getUserId(req)
    const query = supabase
      .from("replies")
      .select("id, lead_id, platform, text, from_lead, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(100)

    if (userId) {
      query.eq("user_id", userId)
    }

    const { data, error } = await query
    if (error) throw error

    const items = (data || []).map(r => ({
      id: r.id,
      lead_id: r.lead_id,
      platform: r.platform,
      created_at: r.created_at,
      from_lead: r.from_lead,
      preview: String(r.text || "").slice(0, 160)
    }))

    return res.json({ ok: true, items })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) })
  }
})

export default router

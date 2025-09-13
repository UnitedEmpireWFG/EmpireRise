import express from "express"
import { supabase } from "../lib/supabase.js"

const router = express.Router()

// POST /api/replies/ingest
// Body: { lead_id, platform, text }
router.post("/replies/ingest", async (req, res) => {
  try {
    const { lead_id, platform, text } = req.body || {}
    if (!lead_id || !platform || !text) {
      return res.status(400).json({ ok: false, error: "lead_id, platform, text required" })
    }

    // store reply
    const { error: rerr } = await supabase
      .from("replies")
      .insert([{ lead_id, platform, text, from_lead: true }])
    if (rerr) throw rerr

    // mark lead state
    await supabase.from("leads").update({ last_reply_at: new Date().toISOString() }).eq("id", lead_id)

    // timeline entry
    await supabase.from("timeline").insert([{ lead_id, kind: "reply", detail: text }])

    // pause any pending messages for this lead (simple safety)
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

export default router

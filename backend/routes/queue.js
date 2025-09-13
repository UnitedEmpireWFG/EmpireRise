import { Router } from "express"
import { supa } from "../db.js"

const r = Router()

// GET /api/queue  → items to send or recently sent
r.get("/", async (_req, res) => {
  try {
    const { data, error } = await supa
      .from("queue")
      .select("*")
      .order("scheduled_at", { ascending: true })
      .limit(300)
    if (error) throw error
    res.json(data || [])
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || "load_failed" })
  }
})

// POST /api/queue/:id/mark-sent  → mark one sent (for Assist LI)
r.post("/:id/mark-sent", async (req, res) => {
  const id = req.params.id
  try {
    const { error } = await supa
      .from("queue")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || "update_failed" })
  }
})

export default r

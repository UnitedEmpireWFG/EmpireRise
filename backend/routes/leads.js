import { Router } from "express"
import { supa } from "../db.js"

const r = Router()

// GET /api/leads  → list of leads with activity counts
r.get("/", async (_req, res) => {
  try {
    const { data, error } = await supa
      .from("leads")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500)
    if (error) throw error
    res.json(data || [])
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || "load_failed" })
  }
})

// POST /api/leads/:id/dnc  → mark Do Not Contact
r.post("/:id/dnc", async (req, res) => {
  const id = req.params.id
  try {
    const { error } = await supa
      .from("leads")
      .update({ dnc: true, dnc_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || "update_failed" })
  }
})

export default r

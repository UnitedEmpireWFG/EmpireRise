import { Router } from "express"
import { supa } from "../db.js"

const r = Router()

// GET /api/prospects
r.get("/api/prospects", async (_req, res) => {
  try {
    const { data, error } = await supa
      .from("prospects")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
    if (error) throw error
    res.json(data || [])
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || "load_failed" })
  }
})

// POST /api/prospects  → add a prospect with optional DNC/notes
r.post("/api/prospects", async (req, res) => {
  const { platform, handle, notes, dnc } = req.body || {}
  try {
    const { error } = await supa.from("prospects").insert({
      platform: platform || "linkedin",
      handle: handle || null,
      notes: notes || null,
      dnc: !!dnc
    })
    if (error) throw error
    res.json({ ok: true })
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || "insert_failed" })
  }
})

export default r

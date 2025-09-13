import express from "express"
import client from "../lib/supabase.js"

const router = express.Router()

router.get("/ping", (_req, res) => {
  res.json({ ok: true, auth: "ready" })
})

router.get("/whoami", async (_req, res) => {
  try {
    const { data, error } = await client.from("settings").select("*").limit(1)
    if (error) return res.status(500).json({ ok: false, error: error.message })
    res.json({ ok: true, sample: data?.[0] || null })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) })
  }
})

export default router

import express from "express"
import { supa } from "../db.js"

const router = express.Router()

// POST /api/dispatch/run  body: { batch }
router.post("/run", async (req, res) => {
  try {
    const batch = Math.min(Number(req.body?.batch || 5), 25)
    const now = new Date().toISOString()

    // pick due unsent
    const { data: due, error: qErr } = await supa
      .from("queue")
      .select("*")
      .lte("scheduled_at", now)
      .neq("status", "sent")
      .order("scheduled_at", { ascending: true })
      .limit(batch)
    if (qErr) return res.status(500).json({ ok: false, error: qErr.message })

    if (!due?.length) return res.json({ ok: true, sent: 0 })

    // simulate send: mark sent and log
    const ids = due.map(d => d.id)
    const updates = await supa.from("queue").update({ status: "sent" }).in("id", ids)
    if (updates.error) return res.status(500).json({ ok: false, error: updates.error.message })

    const logs = due.map(d => ({
      kind: "sent",
      platform: d.platform,
      body: d.body,
      created_at: new Date().toISOString()
    }))
    const ins = await supa.from("logs").insert(logs)
    if (ins.error) return res.status(500).json({ ok: false, error: ins.error.message })

    res.json({ ok: true, sent: due.length })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router

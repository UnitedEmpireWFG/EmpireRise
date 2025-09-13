import { Router } from "express"
import db from "../utils/db.js"

const router = Router()

router.get("/api/li/batch/prefs", async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id || null
    if (!userId) return res.json({})
    const { rows } = await db.query("SELECT * FROM li_batch_prefs WHERE user_id=$1", [userId])
    res.json(rows[0] || {})
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.post("/api/li/batch/prefs", async (req, res) => {
  try {
    const {
      user_id,
      is_enabled = false,
      daily_quota = 25,
      schedule_cron = "0 9 * * *",
      timezone = "America/Edmonton",
      mode = "push"
    } = req.body || {}
    if (!user_id) return res.status(400).json({ ok: false, error: "missing user_id" })

    const { rows } = await db.query(
      `INSERT INTO li_batch_prefs (user_id,is_enabled,daily_quota,schedule_cron,timezone,mode)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO UPDATE SET
         is_enabled=EXCLUDED.is_enabled,
         daily_quota=EXCLUDED.daily_quota,
         schedule_cron=EXCLUDED.schedule_cron,
         timezone=EXCLUDED.timezone,
         mode=EXCLUDED.mode,
         updated_at=NOW()
       RETURNING *`,
      [user_id, is_enabled, daily_quota, schedule_cron, timezone, mode]
    )
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
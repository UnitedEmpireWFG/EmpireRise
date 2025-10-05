/* backend/routes/li_batch.js */
import express from "express"
import db from "../utils/db.js"
import cron from "node-cron"
import { supa } from "../db.js"

const router = express.Router()

// ========== PREFS ==========
router.get("/api/li/batch/prefs", async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id || null
    if (!userId) return res.json({})
    const { rows } = await db.query("SELECT * FROM li_batch_prefs WHERE user_id=$1", [userId])
    res.json(rows[0] || {})
  } catch (e) {
    console.error("li_batch_prefs_get_error", e.message)
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
      mode = "pull"
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
    console.error("li_batch_prefs_post_error", e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ========== TASK HANDLER ==========

async function runLinkedInBatch(userId) {
  console.log("Running liDailyBatch for", userId)

  try {
    // fetch the user's LinkedIn token
    const { data: settings } = await supa
      .from("app_settings")
      .select("linkedin_access_token")
      .eq("user_id", userId)
      .single()

    if (!settings?.linkedin_access_token) {
      console.log("No LinkedIn token, skipping batch", userId)
      return
    }

    // simulate pulling prospects
    console.log(`Pulling prospects for user ${userId} ...`)
    await new Promise(r => setTimeout(r, 1500))

    // mark prospects in DB
    await db.query(
      `INSERT INTO li_prospects (user_id, name, headline, region)
       VALUES ($1, 'John Example', 'Financial Consultant', 'Edmonton')
       ON CONFLICT DO NOTHING`,
      [userId]
    )

    console.log("Batch finished for", userId)
  } catch (err) {
    console.error("li_batch_run_error", err.message)
  }
}

// ========== CRON INITIALIZER ==========

async function scheduleAllBatches() {
  try {
    const { rows } = await db.query(
      "SELECT user_id, schedule_cron, timezone, is_enabled FROM li_batch_prefs WHERE is_enabled=TRUE"
    )

    rows.forEach(({ user_id, schedule_cron, timezone }) => {
      try {
        cron.schedule(
          schedule_cron || "0 9 * * *",
          () => runLinkedInBatch(user_id),
          { timezone: timezone || "America/Edmonton" }
        )
        console.log(`liDailyBatch armed for ${user_id}`)
      } catch (err) {
        console.error("liDailyBatch schedule error", err.message)
      }
    })
  } catch (err) {
    console.error("li_batch_scheduleAll_error", err.message)
  }
}

// run once at boot
scheduleAllBatches()

export default router

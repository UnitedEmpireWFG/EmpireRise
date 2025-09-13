import { Router } from "express"
import db from "../utils/db.js"
import { VAPID_PUBLIC_KEY, sendWebPush } from "../lib/webpush.js"

const router = Router()

router.get("/vapidPublicKey", (_req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY })
})

router.post("/subscribe", async (req, res) => {
  const { user_id, subscription } = req.body || {}
  if (!user_id || !subscription?.endpoint) return res.status(400).json({ ok: false, error: "missing_params" })
  try {
    await db.query(
      `INSERT INTO push_subs (user_id, endpoint, p256dh, auth, raw)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (endpoint) DO NOTHING`,
      [
        user_id,
        subscription.endpoint,
        subscription.keys?.p256dh || null,
        subscription.keys?.auth || null,
        JSON.stringify(subscription)
      ]
    )
    res.json({ ok: true })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

router.post("/test", async (req, res) => {
  const { sub_id, title = "Test", body = "Push works" } = req.body || {}
  if (!sub_id) return res.status(400).json({ ok: false, error: "missing_sub_id" })
  const { rows } = await db.query("SELECT raw FROM push_subs WHERE id=$1", [sub_id])
  if (rows.length === 0) return res.status(404).json({ ok: false, error: "sub_not_found" })
  const out = await sendWebPush(rows[0].raw, { title, body })
  res.json(out)
})

export default router
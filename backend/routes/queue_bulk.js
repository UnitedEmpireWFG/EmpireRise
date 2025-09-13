import { Router } from "express"
import db from "../utils/db.js"
import { sendWebPush } from "../lib/webpush.js"

const router = Router()

router.post("/api/queue/bulk_approve", async (req, res) => {
  try {
    const userId = req.user?.id || req.body.user_id
    if (!userId) return res.status(400).json({ ok: false, error: "missing user_id" })

    const { network = "linkedin", ids = [], filter = "ready" } = req.body || {}
    if (network !== "linkedin") return res.status(400).json({ ok: false, error: "only_linkedin_supported" })

    let rows
    if (ids.length > 0) {
      rows = (await db.query(
        `UPDATE outbound_queue
           SET status='approved', approved_at=NOW(), approved_by=$1
         WHERE user_id=$1 AND network=$2 AND id = ANY($3) AND status IN ('ready','draft')
         RETURNING id`,
        [userId, network, ids]
      )).rows
    } else {
      const statusFilter = filter === "draft" ? "draft" : "ready"
      rows = (await db.query(
        `UPDATE outbound_queue
           SET status='approved', approved_at=NOW(), approved_by=$1
         WHERE user_id=$1 AND network=$2 AND status=$3
         RETURNING id`,
        [userId, network, statusFilter]
      )).rows
    }

    const count = rows.length
    const subs = (await db.query("SELECT raw FROM push_subs WHERE user_id=$1", [userId])).rows
    await Promise.allSettled(
      subs.map(s => sendWebPush(s.raw, {
        title: "LinkedIn bulk approved",
        body: `${count} items ready for one tap`,
        data: { type: "li-batch", count }
      }))
    )

    res.json({ ok: true, count })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
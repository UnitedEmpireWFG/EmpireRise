import { Router } from "express"
import db from "../utils/db.js"

const router = Router()

router.get("/", async (_req, res) => {
  try {
    const { rows } = await db.query(
      `select id, text, message, content
         from queue
        where platform='linkedin' and status in ('ready','scheduled')
        order by scheduled_at asc nulls last, created_at asc
        limit 1`
    )
    const m = rows[0]
    if (!m) return res.json({})
    res.json({ id:m.id, text:m.text||m.message||m.content, link:"https://www.linkedin.com/messaging/" })
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message })
  }
})

router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id
    const { rows } = await db.query(`select id, text, message, content from queue where id=$1`, [id])
    const m = rows[0]
    if (!m) return res.json({})
    res.json({ id:m.id, text:m.text||m.message||m.content, link:"https://www.linkedin.com/messaging/" })
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message })
  }
})

router.post("/:id/sent", async (req, res) => {
  try {
    const id = req.params.id
    await db.query(`update queue set status='sent', sent_at=now() where id=$1`, [id])
    res.json({ ok:true })
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message })
  }
})

export default router
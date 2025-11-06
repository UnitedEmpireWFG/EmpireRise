import { Router } from "express"
import db from "../utils/db.js"

const router = Router()

router.get("/api/dashboard/summary", async (_req, res) => {
  try {
    const [{ rows: ap }] = await Promise.all([
      db.query("select count(*)::int as c from approvals where status='pending'")
    ])
    const [{ rows: qr }] = await Promise.all([
      db.query("select count(*)::int as c from queue where status in ('ready','scheduled')")
    ])
    const [{ rows: ld }] = await Promise.all([
      db.query("select count(*)::int as c from leads")
    ])
    const [{ rows: pr }] = await Promise.all([
      db.query("select count(*)::int as c from prospects where coalesce(dnc,false)=false")
    ])
    const since = new Date(Date.now() - 28*24*3600*1000).toISOString()
    const sent    = (await db.query("select count(*)::int as c from sent_log where created_at >= $1", [since])).rows[0]?.c || 0
    const replies = (await db.query("select count(*)::int as c from replies where created_at >= $1", [since])).rows[0]?.c || 0
    const quals   = (await db.query("select count(*)::int as c from leads where qualified_at >= $1", [since])).rows[0]?.c || 0
    const books   = (await db.query("select count(*)::int as c from bookings where created_at >= $1", [since])).rows[0]?.c || 0

    const s = (await db.query("select * from app_config where id=1")).rows[0] || {}
    const wc = {
      open: s.rate_open ?? 0.25,
      reply: s.rate_reply ?? 0.08,
      qualified: s.rate_qualified ?? 0.03,
      booked: s.rate_booked ?? 0.02
    }

    res.json({
      ok: true,
      totals: {
        approvals_pending: ap[0]?.c || 0,
        queue_ready: qr[0]?.c || 0,
        leads_total: ld[0]?.c || 0,
        prospects_total: pr[0]?.c || 0
      },
      funnel: { sent, replies, qualified: quals, booked: books },
      worst_case: wc
    })
  } catch (e) {
    res.json({ ok: true, totals: { approvals_pending: 0, queue_ready: 0, leads_total: 0, prospects_total: 0 }, funnel: { sent: 0, replies: 0, qualified: 0, booked: 0 }, worst_case: { open:.25, reply:.08, qualified:.03, booked:.02 } })
  }
})

export default router
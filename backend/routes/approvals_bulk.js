import { Router } from "express"
import { supa } from "../db.js"

const router = Router()

/*
POST /api/approvals/bulk_approve
body: { scope: 'all' | 'linkedin' | 'ready' }

- all       : approve everything currently pending (all platforms)
- linkedin  : approve only LinkedIn items
- ready     : flip scheduled -> ready for non-LinkedIn items

Notes
- LinkedIn items require explicit approval → status becomes 'approved'
- Other platforms (IG/FB, etc.) go straight to 'ready'
- Scheduler should send items with status in ['approved','ready','scheduled']
*/
router.post("/api/approvals/bulk_approve", async (req, res) => {
  try {
    const scope = String(req.body?.scope || "all").toLowerCase()

    const { data: rows, error } = await supa
      .from("queue")
      .select("id, platform, status")
      .in("status", ["scheduled", "ready"]) // tolerate both
      .order("created_at", { ascending: true })
      .limit(2000)

    if (error) throw error

    const items = (rows || []).filter(r => {
      if (scope === "linkedin") return r.platform === "linkedin" && r.status === "scheduled"
      if (scope === "ready")    return r.platform !== "linkedin" && r.status === "scheduled"
      return r.status === "scheduled"
    })

    if (items.length === 0) {
      return res.json({ ok: true, updated: 0, li: 0, other: 0 })
    }

    const liIds    = items.filter(x => x.platform === "linkedin").map(x => x.id)
    const otherIds = items.filter(x => x.platform !== "linkedin").map(x => x.id)

    if (liIds.length) {
      const { error: e1 } = await supa
        .from("queue")
        .update({ status: "approved" })
        .in("id", liIds)
      if (e1) throw e1
    }

    if (otherIds.length) {
      const { error: e2 } = await supa
        .from("queue")
        .update({ status: "ready" })
        .in("id", otherIds)
      if (e2) throw e2
    }

    return res.json({
      ok: true,
      updated: items.length,
      li: liIds.length,
      other: otherIds.length
    })
  } catch (e) {
    return res.json({ ok: false, error: e?.message || "bulk_approve_failed" })
  }
})

export default router

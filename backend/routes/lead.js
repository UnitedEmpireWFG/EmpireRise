import { Router } from "express";
import { supa } from "../db.js";
const r = Router();

/**
 * Heuristic score:
 *  - base by recent inbound interactions
 *  - recency boosts
 *  - platform weighting (LI slightly higher)
 */
function scoreLead({ inboundCount=0, lastInboundAt=null, platform="" }) {
  let s = 10 + Math.min(60, inboundCount * 12); // up to +60 from count
  if (lastInboundAt) {
    const ageDays = (Date.now() - new Date(lastInboundAt).getTime()) / 86400000;
    if (ageDays <= 3)      s += 25;
    else if (ageDays <=7)  s += 15;
    else if (ageDays <=30) s += 5;
  }
  if (platform === "linkedin") s += 8;
  if (platform === "instagram") s += 4;
  if (platform === "facebook") s += 4;
  return Math.max(0, Math.min(100, Math.round(s)));
}

// GET /api/lead/list
r.get("/list", async (_req, res) => {
  try {
    // Pull a reasonable slice; you can add filters later.
    const { data: contacts, error } = await supa
      .from("contacts")
      .select("id,name,handle,platform,lead_type,score,updated_at")
      .order("score", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    // Fetch inbound counts / recency for these contacts
    const ids = (contacts||[]).map(c => c.id);
    let inboundMap = {};
    if (ids.length) {
      const { data: agg } = await supa.rpc("interactions_inbound_agg", { contact_ids: ids }); // if you created a function
      if (agg && Array.isArray(agg)) {
        inboundMap = agg.reduce((m, a) => (m[a.contact_id] = a, m), {});
      } else {
        // Fallback without a Postgres function: small multi-queries
        for (const cid of ids) {
          const { data: ix } = await supa
            .from("interactions")
            .select("direction,created_at")
            .eq("contact_id", cid)
            .eq("direction", "inbound")
            .order("created_at", { ascending: false })
            .limit(10);
          inboundMap[cid] = {
            inboundCount: (ix||[]).length,
            lastInboundAt: (ix && ix[0]?.created_at) || null
          };
        }
      }
    }

    // Compute scores server-side (and update on the fly)
    const enriched = [];
    for (const c of contacts||[]) {
      const { inboundCount=0, lastInboundAt=null } = inboundMap[c.id] || {};
      const s = scoreLead({ inboundCount, lastInboundAt, platform: c.platform });
      enriched.push({ ...c, score: s, inboundCount, lastInboundAt });
    }

    // Persist new scores (bulk update)
    for (const e of enriched) {
      await supa.from("contacts").update({ score: e.score, updated_at: new Date().toISOString() }).eq("id", e.id);
    }

    res.json({ ok: true, items: enriched });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default r;

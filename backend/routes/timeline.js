// backend/routes/timeline.js
import { Router } from "express";
import { supa } from "../db.js";

const r = Router();

/**
 * GET /api/lead/list?limit=50
 * Returns: { ok: true, items: [ { id, name, platform, handle, stage, score, last_inbound_at, last_inbound_body } ] }
 */
r.get("/list", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

    // Pull core contact info
    const { data: contacts, error: cErr } = await supa
      .from("contacts")
      .select("id, name, platform, handle, stage, score")
      .order("score", { ascending: false })
      .limit(limit);

    if (cErr) throw new Error(cErr.message);

    const ids = (contacts || []).map(c => c.id);
    if (!ids.length) return res.json({ ok: true, items: [] });

    // Pull the most recent inbound interaction per contact
    const { data: inter, error: iErr } = await supa
      .from("interactions")
      .select("contact_id, body, created_at, direction")
      .in("contact_id", ids)
      .order("created_at", { ascending: false });

    if (iErr) throw new Error(iErr.message);

    // Build a quick map: first inbound we see in this descending list is latest
    const lastMap = new Map();
    for (const row of inter || []) {
      if (row.direction !== "inbound") continue;
      if (!lastMap.has(row.contact_id)) {
        lastMap.set(row.contact_id, {
          last_inbound_at: row.created_at,
          last_inbound_body: row.body,
        });
      }
    }

    const items = (contacts || []).map(c => {
      const last = lastMap.get(c.id) || {};
      return {
        id: c.id,
        name: c.name || "",
        platform: c.platform || "",
        handle: c.handle || "",
        stage: c.stage || "prospect",
        score: Number(c.score ?? 0),
        last_inbound_at: last.last_inbound_at || null,
        last_inbound_body: last.last_inbound_body || null,
      };
    });

    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default r;

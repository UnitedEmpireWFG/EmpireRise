import { Router } from "express";
import { supa } from "../db.js";

const r = Router();

/**
 * GET /api/queue/list
 * Returns the next items with contact name + platform (for the slim UI list)
 */
r.get("/list", async (_req, res) => {
  try {
    // Pull a reasonable window (e.g. next 200)
    const { data, error } = await supa
      .from("queue")
      .select("id, platform, status, scheduled_at, contact_id, preview")
      .order("scheduled_at", { ascending: true })
      .limit(200);

    if (error) return res.status(500).json({ ok: false, error: error.message });

    // Fetch names in one go (only ids that exist)
    const ids = [...new Set((data || []).map(x => x.contact_id).filter(Boolean))];
    let map = {};
    if (ids.length) {
      const { data: contacts } = await supa
        .from("contacts")
        .select("id, name")
        .in("id", ids);
      (contacts || []).forEach(c => { map[c.id] = c.name; });
    }

    const out = (data || []).map(q => ({
      id: q.id,
      platform: q.platform,
      name: map[q.contact_id] || "",
      status: q.status,
      scheduled_at: q.scheduled_at,
      preview: q.preview || ""
    }));

    res.json({ ok: true, queue: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default r;

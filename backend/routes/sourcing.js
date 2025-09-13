import { Router } from "express";
import { supa } from "../db.js";

const r2 = Router();

// Unanswered: contacts with recent inbound and no recent outbound
r2.get("/unanswered", async (_req, res) => {
  try {
    // Simple heuristic: anyone with inbound in last 30 days
    const since = new Date(Date.now() - 30*86400000).toISOString();
    const { data: inbound, error } = await supa
      .from("interactions")
      .select("contact_id, body, created_at, direction")
      .eq("direction","inbound")
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((inbound || []).map(x => x.contact_id))).filter(Boolean);
    if (ids.length === 0) return res.json({ ok: true, items: [] });

    const { data: contacts, error: cErr } = await supa
      .from("contacts")
      .select("id,name,platform,handle,stage,persona")
      .in("id", ids)
      .eq("do_not_contact", false)
      .limit(200);
    if (cErr) throw new Error(cErr.message);

    res.json({ ok:true, items: contacts || [] });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

// New connections: stage=prospect & created recently
r2.get("/new-connections", async (_req, res) => {
  try {
    const { data, error } = await supa
      .from("contacts")
      .select("id,name,platform,handle,stage,persona,created_at")
      .eq("stage","prospect")
      .eq("do_not_contact", false)
      .order("created_at",{ ascending:false })
      .limit(200);
    if (error) throw new Error(error.message);
    res.json({ ok:true, items:data || [] });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

export default r2;

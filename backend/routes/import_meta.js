import { Router } from "express";
import { supa } from "../db.js";

/**
 * Minimal Meta import stub:
 * - Accepts posted array of interactions for now (quick unblock).
 * - Shape: [{ platform:'instagram'|'facebook', external_id, handle, name, direction:'inbound'|'outbound', body, created_at }]
 * Later you can replace the body with real Graph API calls using your saved tokens.
 */
const r = Router();

async function upsertContact({ platform, handle, name }) {
  // Find by (platform, handle), or create.
  const { data: found } = await supa
    .from("contacts")
    .select("id")
    .eq("platform", platform)
    .eq("handle", handle)
    .limit(1)
    .maybeSingle();
  if (found?.id) return found.id;

  const ins = await supa
    .from("contacts")
    .insert({
      platform,
      handle,
      name: name || handle || "Unknown",
      stage: "prospect"
    })
    .select("id")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  return ins.data.id;
}

r.post("/", async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.json({ ok: true, imported: 0 });

    let imported = 0;
    for (const it of items) {
      const platform = (it.platform || "").toLowerCase();
      if (!["instagram","facebook"].includes(platform)) continue;

      const contact_id = await upsertContact({
        platform,
        handle: it.handle || it.external_id || "",
        name: it.name || ""
      });

      // avoid dup insert by (platform, external_id)
      if (it.external_id) {
        const { data: dupe } = await supa
          .from("interactions")
          .select("id")
          .eq("platform", platform)
          .eq("external_id", it.external_id)
          .limit(1)
          .maybeSingle();
        if (dupe?.id) continue;
      }

      const ins = await supa.from("interactions").insert({
        contact_id,
        platform,
        type: it.type || "dm",
        direction: it.direction || "inbound",
        body: it.body || "",
        external_id: it.external_id || null,
        created_at: it.created_at ? new Date(it.created_at).toISOString() : new Date().toISOString()
      });
      if (ins.error) throw new Error(ins.error.message);
      imported++;
    }

    res.json({ ok: true, imported });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default r;

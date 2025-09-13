import { Router } from "express";
import { supa } from "../db.js";

/**
 * LinkedIn import stub:
 * Same contract as Meta stub. Post items you exported (CSV->JSON) or adapter in future.
 */
const r = Router();

async function upsertContact({ handle, name }) {
  const platform = "linkedin";
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
      const contact_id = await upsertContact({
        handle: it.handle || it.external_id || "",
        name: it.name || ""
      });

      if (it.external_id) {
        const { data: dupe } = await supa
          .from("interactions")
          .select("id")
          .eq("platform", "linkedin")
          .eq("external_id", it.external_id)
          .limit(1)
          .maybeSingle();
        if (dupe?.id) continue;
      }

      const ins = await supa.from("interactions").insert({
        contact_id,
        platform: "linkedin",
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

import { Router } from "express";
import { supa } from "../db.js";

const r = Router();

/*
POST /api/leads/add-warm
Body JSON:
{
  "name": "Jane Doe",
  "platform": "instagram" | "facebook" | "linkedin",
  "handle": "jane.doe",               // username or profile slug
  "external_id": "",                  // if you have it, optional
  "persona": "client" | "recruit",    // defaults to "client"
  "city": "Edmonton",                 // optional
  "notes": "Met at kids event.",
  "summary": "We chatted about budgeting and daycare costs."  // stored as first inbound
}
*/
r.post("/add-warm", async (req, res) => {
  try {
    const {
      name = "",
      platform = "",
      handle = "",
      external_id = "",
      persona = "client",
      city = "",
      notes = "",
      summary = ""
    } = req.body || {};

    if (!platform || !(handle || external_id)) {
      return res.status(400).json({ ok: false, error: "platform and handle or external_id required" });
    }

    // Find or create contact by (platform, handle) first, else by external_id
    let contact;
    if (handle) {
      const { data } = await supa
        .from("contacts")
        .select("*")
        .eq("platform", platform)
        .eq("handle", handle)
        .limit(1)
        .maybeSingle();
      contact = data || null;
    }

    if (!contact && external_id) {
      const { data } = await supa
        .from("contacts")
        .select("*")
        .eq("platform", platform)
        .eq("external_id", external_id)
        .limit(1)
        .maybeSingle();
      contact = data || null;
    }

    const nowIso = new Date().toISOString();

    if (!contact) {
      const insert = await supa.from("contacts").insert([{
        name,
        platform,
        handle: handle || null,
        external_id: external_id || null,
        persona,
        city: city || null,
        stage: "warm",
        tags: ["warm_lead_manual"],
        last_note: notes || null,
        updated_at: nowIso
      }]).select("*").single();
      if (insert.error) throw new Error(insert.error.message);
      contact = insert.data;
    } else {
      const update = await supa.from("contacts").update({
        name: name || contact.name,
        persona,
        city: city || contact.city,
        stage: "warm",
        last_note: notes || contact.last_note,
        tags: Array.isArray(contact.tags)
          ? Array.from(new Set([...contact.tags, "warm_lead_manual"]))
          : ["warm_lead_manual"],
        updated_at: nowIso
      }).eq("id", contact.id).select("*").single();
      if (update.error) throw new Error(update.error.message);
      contact = update.data;
    }

    // Seed an inbound interaction so the generator has context
    if (summary) {
      await supa.from("interactions").insert([{
        contact_id: contact.id,
        platform,
        type: "dm",
        direction: "inbound",
        body: summary,
        created_at: nowIso
      }]);
    }

    return res.json({ ok: true, contact });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default r;

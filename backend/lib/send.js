import fetch from "node-fetch";
import { supa } from "../db.js";

async function sendFacebook(psid, text) {
  const token = process.env.META_PAGE_TOKEN;
  const url = "https://graph.facebook.com/v19.0/me/messages";
  const r = await fetch(`${url}?access_token=${encodeURIComponent(token)}`, {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ recipient:{ id: psid }, message:{ text } })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "FB send failed");
  return j;
}

async function sendInstagram(psid, text) {
  const token = process.env.META_PAGE_TOKEN;
  const igid  = process.env.IG_BUSINESS_ID;
  const url = `https://graph.facebook.com/v19.0/${igid}/messages`;
  const r = await fetch(`${url}?access_token=${encodeURIComponent(token)}`, {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ recipient:{ id: psid }, message:{ text } })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "IG send failed");
  return j;
}

export async function sendMessage(row) {
  const { data: c } = await supa
    .from("contacts")
    .select("platform, external_id, name")
    .eq("id", row.contact_id)
    .maybeSingle();

  if (!c) return { ok: false, error: "contact not found" };
  if (!c.external_id) return { ok: true, info: "skipped (no PSID)" };

  try {
    if (c.platform === "facebook") {
      await sendFacebook(c.external_id, row.body);
      return { ok: true, info: "fb sent" };
    }
    if (c.platform === "instagram") {
      await sendInstagram(c.external_id, row.body);
      return { ok: true, info: "ig sent" };
    }
    return { ok: true, info: "skipped (unsupported platform)" }; // LinkedIn = assistive
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

import { addAssistantMessage } from "./replies_ingest.js"

// ... inside your send function, after platform send succeeded:
try {
  await addAssistantMessage({
    contact_id: input.contact_id,
    platform: input.platform,
    text: payload?.text || input?.text || ""
  })
} catch {}

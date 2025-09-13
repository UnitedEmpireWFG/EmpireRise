import fetch from "node-fetch";
import { supa } from "../db.js";

const IG_ID = process.env.META_IG_BUSINESS_ID;
const PAGE_ID = process.env.META_PAGE_ID;
const TOKEN = process.env.META_ACCESS_TOKEN;

function okToken() {
  return Boolean(TOKEN && (IG_ID || PAGE_ID));
}

function isCanada(s) {
  if (!s) return false;
  const t = s.toLowerCase();
  const hits = [
    "canada","alberta","edmonton","calgary","ontario","toronto","mississauga",
    "british columbia","vancouver","surrey","richmond","manitoba","winnipeg",
    "saskatchewan","regina","quebec","montreal","laval","new brunswick",
    "nova scotia","halifax","prince edward island","pei","newfoundland","yukon","nunavut","nwt","northwest territories"
  ];
  return hits.some(h => t.includes(h));
}

function excludeAdvisor(s) {
  if (!s) return false;
  const t = s.toLowerCase();
  const block = [
    "insurance advisor","financial advisor","investment advisor","ifa","pfa",
    "wealth advisor","broker at","licensed life insurance",
    "experior","world financial group","wfg","gfg","global financial",
    "manulife advisor","sun life advisor","ig wealth","rbc advisor","td advisor","cibc advisor","scotiabank advisor"
  ];
  return block.some(h => t.includes(h));
}

async function upsertContact({ platform, external_id, name, handle, location, bio }) {
  if (!external_id) return null;

  // Canada and exclusion checks
  const locStr = String(location || bio || name || handle || "").slice(0, 400);
  if (!isCanada(locStr)) return null;
  if (excludeAdvisor(locStr)) return null;

  const ins = await supa.from("imports").insert({ platform, external_id }).select("id").maybeSingle();
  if (ins?.error && ins.error.code !== "23505") return null; // real error
  const row = {
    platform,
    external_id,
    name: name || handle || "Unknown",
    handle: handle || null,
    location: location || null,
    source: "autosource_meta",
    stage: "prospect",
    persona: "unknown",
    notes: bio || null
  };
  const { data } = await supa
    .from("contacts")
    .upsert(row, { onConflict: "platform,external_id" })
    .select("id")
    .maybeSingle();
  return data?.id || null;
}

/* IG: commenters and likers on your last 5 media */
export async function igHarvestRecentEngagers() {
  if (!okToken() || !IG_ID) return { ok: true, added: 0, skipped: "no_ig" };
  let added = 0;
  const mediaRes = await fetch(`https://graph.facebook.com/v19.0/${IG_ID}/media?fields=id,caption,media_type&limit=5&access_token=${TOKEN}`);
  const media = await mediaRes.json();
  if (!media?.data) return { ok: true, added };

  for (const m of media.data) {
    // comments
    const cr = await fetch(`https://graph.facebook.com/v19.0/${m.id}/comments?fields=id,text,username&limit=50&access_token=${TOKEN}`).then(r=>r.json()).catch(()=>({}));
    for (const c of cr.data || []) {
      const handle = c.username || null;
      if (!handle) continue;
      const id = await upsertContact({
        platform: "instagram",
        external_id: `ig_c_${c.id}`,
        name: handle,
        handle,
        location: null,
        bio: c.text || null
      });
      if (id) added++;
    }
    // likes
    const lr = await fetch(`https://graph.facebook.com/v19.0/${m.id}/likes?fields=username&limit=100&access_token=${TOKEN}`).then(r=>r.json()).catch(()=>({}));
    for (const l of (lr.data || [])) {
      const handle = l.username || null;
      if (!handle) continue;
      const id = await upsertContact({
        platform: "instagram",
        external_id: `ig_l_${m.id}_${handle}`,
        name: handle,
        handle,
        location: null,
        bio: null
      });
      if (id) added++;
    }
  }
  return { ok: true, added };
}

/* FB: recent page post commenters */
export async function fbHarvestPage() {
  if (!okToken() || !PAGE_ID) return { ok: true, added: 0, skipped: "no_page" };
  let added = 0;
  const pr = await fetch(`https://graph.facebook.com/v19.0/${PAGE_ID}/posts?fields=id,message&limit=5&access_token=${TOKEN}`).then(r=>r.json()).catch(()=>({}));
  for (const p of pr.data || []) {
    const cr = await fetch(`https://graph.facebook.com/v19.0/${p.id}/comments?fields=from,message&limit=50&access_token=${TOKEN}`).then(r=>r.json()).catch(()=>({}));
    for (const c of cr.data || []) {
      const name = c.from?.name || null;
      const ext = c.from?.id || null;
      if (!ext) continue;
      const id = await upsertContact({
        platform: "facebook",
        external_id: `fb_u_${ext}`,
        name,
        handle: null,
        location: null,
        bio: c.message || null
      });
      if (id) added++;
    }
  }
  return { ok: true, added };
}

export async function metaHarvestAll() {
  const a = await igHarvestRecentEngagers();
  const b = await fbHarvestPage();
  return { ok: true, ig_added: a.added || 0, fb_added: b.added || 0 };
}


import fetch from "node-fetch";
import { supa } from "../db.js";

const TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;

function okToken() {
  return Boolean(TOKEN);
}
function isCanada(s) {
  if (!s) return false;
  const t = s.toLowerCase();
  const hits = [
    "canada","edmonton","calgary","alberta","ontario","toronto","british columbia","vancouver","manitoba","winnipeg",
    "saskatchewan","regina","quebec","montreal","nova scotia","halifax","pei","prince edward island","newfoundland","yukon","nunavut","nwt","northwest territories"
  ];
  return hits.some(h => t.includes(h));
}
function excludeAdvisor(s) {
  if (!s) return false;
  const t = s.toLowerCase();
  const block = [
    "insurance advisor","financial advisor","investment advisor","ifa","pfa","wealth advisor","licensed life",
    "experior","wfg","world financial group","gfg","global financial","manulife advisor","sun life advisor","ig wealth","rbc advisor","td advisor","cibc advisor","scotiabank advisor"
  ];
  return block.some(h => t.includes(h));
}

async function upsertContact({ external_id, name, headline, location }) {
  if (!external_id) return null;

  const concat = `${name || ""} ${headline || ""} ${location || ""}`.slice(0, 400);
  if (!isCanada(concat)) return null;
  if (excludeAdvisor(concat)) return null;

  const ins = await supa.from("imports").insert({ platform: "linkedin", external_id }).select("id").maybeSingle();
  if (ins?.error && ins.error.code !== "23505") return null;

  const row = {
    platform: "linkedin",
    external_id,
    name: name || "Unknown",
    handle: null,
    location: location || null,
    source: "autosource_linkedin",
    stage: "prospect",
    persona: "unknown",
    notes: headline || null
  };
  const { data } = await supa
    .from("contacts")
    .upsert(row, { onConflict: "platform,external_id" })
    .select("id")
    .maybeSingle();
  return data?.id || null;
}

/* Recent engagers on your posts */
export async function liHarvestRecentEngagers() {
  if (!okToken()) return { ok: true, added: 0, skipped: "no_token" };
  let added = 0;

  const me = await fetch("https://api.linkedin.com/v2/me", {
    headers: { Authorization: `Bearer ${TOKEN}` }
  }).then(r=>r.json()).catch(()=>null);
  const meId = me?.id;
  if (!meId) return { ok: true, added, skipped: "me_fail" };

  const posts = await fetch(`https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:person:${meId})&sortBy=LAST_MODIFIED&count=5`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  }).then(r=>r.json()).catch(()=>({}));

  const elements = posts?.elements || [];
  for (const el of elements) {
    const urn = el?.id;
    if (!urn) continue;

    // reactions
    const reacts = await fetch(`https://api.linkedin.com/v2/reactions?q=entity&entity=${encodeURIComponent(urn)}&count=100`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }).then(r=>r.json()).catch(()=>({}));
    for (const r of reacts.elements || []) {
      const actor = r?.created?.actor || "";
      const pid = actor.replace("urn:li:person:", "");
      if (!pid) continue;
      await upsertContact({ external_id: pid, name: null, headline: null, location: null });
      added++;
    }

    // comments
    const comments = await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(urn)}/comments?count=50`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }).then(r=>r.json()).catch(()=>({}));
    for (const c of comments.elements || []) {
      const actor = c?.actor || "";
      const pid = actor.replace("urn:li:person:", "");
      const name = c?.actor?.name || null;
      const head = typeof c?.message === "string" ? c.message : null;
      await upsertContact({ external_id: pid, name, headline: head, location: null });
      added++;
    }
  }

  return { ok: true, added };
}


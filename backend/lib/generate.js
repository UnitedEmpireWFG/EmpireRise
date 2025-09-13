// backend/lib/generate.js
import fetch from "node-fetch";
import { supabase } from "./supabase.js";

const BANNED_PHRASES = [
  "mutual fund","guaranteed return","get rich","act now","limited time","no risk","100%","100 percent"
];

const ADVISOR_WORDS = [
  "advisor","adviser","broker","planner","wealth","ifa","portfolio",
  "licensed advisor","licensed planner","mga","agency","insurance broker",
  "investment advisor"
];

const CANADA_HINTS = [
  "canada","cdn","rrsp","tfsa","fhsa","resp","rdsp","cpp","ei","province","provincial"
];

const PLATFORM_LIMITS = {
  linkedin: { max: 260 }, instagram: { max: 240 }, facebook: { max: 240 },
  threads: { max: 240 }, x: { max: 240 }, tiktok: { max: 240 }, reddit: { max: 240 },
  default: { max: 240 }
};

function isAdvisorLike(lead) {
  const blob = [lead.title, lead.tags, lead.notes, lead.bio].filter(Boolean).join(" ").toLowerCase();
  return ADVISOR_WORDS.some(w => blob.includes(w));
}
function looksCanadian(lead) {
  const blob = [lead.country, lead.tags, lead.notes, lead.bio].filter(Boolean).join(" ").toLowerCase();
  if ((lead.country || "").toLowerCase() === "canada") return true;
  return CANADA_HINTS.some(h => blob.includes(h));
}
function bannedContent(text) {
  const t = (text || "").toLowerCase();
  return BANNED_PHRASES.some(p => t.includes(p));
}
function tooWeak(text, platform) {
  if (!text) return true;
  const t = text.trim();
  const max = (PLATFORM_LIMITS[platform]?.max ?? PLATFORM_LIMITS.default.max);
  if (t.length < 28) return true;
  if (t.length > max) return true;
  if (/http(s)?:\/\//i.test(t)) return true;
  if (/\?{2,}/.test(t)) return true;
  return false;
}

function pickTrack(lead) {
  const blob = [lead.tags, lead.notes, lead.bio].filter(Boolean).join(" ").toLowerCase();
  let recruit = 0, client = 0;
  if (/(bank teller|csr|claims|adjuster|sales|retail|fitness|hospitality|student|open to work|career change)/.test(blob)) recruit += 2;
  if (/(looking|hiring|part time|side income|remote)/.test(blob)) recruit += 1;
  if (/(mortgage|home|refi|debt|tfsa|rrsp|fhsa|life insurance|critical illness|disability|resp|rdsp|estate|retirement)/.test(blob)) client += 2;
  if (/(new job|moved|baby|wedding|house|closing)/.test(blob)) client += 1;
  if (client > recruit && /(tfsa|rrsp|fhsa|mortgage|life insurance|disability|critical illness|resp|rdsp)/.test(blob)) return "client";
  return recruit >= client ? "recruit" : "client";
}
function factline(lead) {
  const facts = [];
  if (lead.full_name) facts.push(`name=${lead.full_name}`);
  if (lead.username) facts.push(`handle=${lead.username}`);
  if (lead.tags) facts.push(`tags=${lead.tags.slice(0,160)}`);
  if (lead.notes) facts.push(`notes=${lead.notes.slice(0,200)}`);
  if (lead.bio) facts.push(`bio=${lead.bio.slice(0,160)}`);
  return facts.join(" | ");
}

async function chatOnce(model, sys, user) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature: 0.6, max_tokens: 140 })
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.choices?.[0]?.message?.content?.trim() || null;
}
function baseSystem(platform) {
  return [
    "You are an assistant that writes very short, natural DMs for Canadian audiences.",
    "Keep it human, specific, and conversational.",
    "No emojis. No hype. One question max.",
    "Do not include links in the first DM.",
    "Use Canadian context and spelling where relevant.",
    `Platform: ${platform}.`,
    "Never mention mutual funds. If investment is implied, stay general or prefer segregated funds wording subtly.",
    "If recruit track, mention training and licensing support without pressure.",
    "If client track, offer a quick, simple review without pushing products.",
    "Keep it under the platform limit."
  ].join(" ");
}
function recruitUser(facts) {
  return `Track=recruit. Facts: ${facts}. Goal: start a warm, low-pressure chat to gauge interest in a flexible licensed role with training in Canada. Avoid links. One or two sentences, end with one question.`;
}
function clientUser(facts) {
  return `Track=client. Facts: ${facts}. Goal: start a warm, low-pressure chat about a quick review of mortgage, insurance, or savings options in Canada. Avoid links. One or two sentences, end with one question.`;
}
function scoreDraft(text, platform, track) {
  if (!text) return -1000;
  if (tooWeak(text, platform)) return -500;
  if (bannedContent(text)) return -400;
  let score = 0;
  const t = text.toLowerCase();
  if (!/[!]{2,}/.test(text)) score += 10;
  if (!/\ball\b|\beveryone\b|\bguarantee\b/.test(t)) score += 10;
  const qCount = (text.match(/\?/g) || []).length;
  if (qCount === 1) score += 15;
  else if (qCount === 0) score -= 10;
  else score -= 10;
  if (track === "recruit" && /(training|licensed|flexible|role|team)/.test(t)) score += 10;
  if (track === "client" && /(review|options|mortgage|insurance|protect|savings|plan)/.test(t)) score += 10;
  const len = text.length;
  if (len >= 60 && len <= 180) score += 10;
  if (!/http(s)?:\/\//.test(t)) score += 10;
  return score;
}

export async function draftWarmups(leads) {
  const out = [];
  for (const lead of leads) {
    try {
      if (!lead) continue;
      if (lead.do_not_contact) continue;
      if (isAdvisorLike(lead)) continue;
      if (!looksCanadian(lead)) continue;

      const { data: evs } = await supabase
        .from("contact_events").select("kind, at")
        .eq("lead_id", lead.id).order("at", { ascending: false }).limit(1);
      const last = evs?.[0];
      if (last?.kind === "declined") {
        const days = (Date.now() - new Date(last.at).getTime()) / 86400000;
        if (days < 90) continue;
      }

      const platform = (lead.platform || "linkedin").trim().toLowerCase();
      const track = pickTrack(lead);
      const facts = factline(lead);
      const sys = baseSystem(platform);
      const model = "gpt-4o-mini";

      const r1 = await chatOnce(model, sys, recruitUser(facts));
      const r2 = await chatOnce(model, sys, clientUser(facts));
      const s1 = scoreDraft(r1, platform, "recruit");
      const s2 = scoreDraft(r2, platform, "client");

      let chosen = track === "recruit" ? r1 : r2;
      let chosenScore = track === "recruit" ? s1 : s2;

      const other = track === "recruit" ? r2 : r1;
      const otherScore = track === "recruit" ? s2 : s1;
      if (otherScore - chosenScore >= 8) {
        chosen = other; chosenScore = otherScore;
      }

      if (bannedContent(chosen) || tooWeak(chosen, platform)) {
        const retry = track === "recruit"
          ? await chatOnce(model, sys, recruitUser(facts))
          : await chatOnce(model, sys, clientUser(facts));
        if (!retry || bannedContent(retry) || tooWeak(retry, platform)) {
          const name = lead.full_name || lead.username || "there";
          chosen = track === "recruit"
            ? `Hey ${name}, I noticed your profile. Open to a flexible licensed role in Canada with training and support?`
            : `Hi ${name}, I help Canadians review mortgage, insurance, and savings options. Want a quick overview to see if anything fits?`;
        } else {
          chosen = retry;
        }
      }

      out.push({
        workspace_id: null,
        lead_id: lead.id,
        platform,
        track,
        body: chosen.trim(),
        status: "draft"
      });
    } catch { continue; }
  }
  return out;
}

export async function saveDrafts(workspace_id, drafts) {
  if (!drafts.length) return { inserted: 0 };
  const rows = drafts.map(d => ({
    workspace_id,
    lead_id: d.lead_id || null,
    platform: d.platform || "linkedin",
    body: d.body,
    status: "draft",
    track: d.track || null
  }));
  const { error, count } = await supabase.from("messages").insert(rows, { count: "exact" });
  if (error) throw new Error(error.message);
  return { inserted: count || rows.length };
}


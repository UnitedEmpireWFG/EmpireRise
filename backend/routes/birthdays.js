// backend/routes/birthdays.js
import express from "express";
import { supabase } from "../lib/supabase.js";
import fetch from "node-fetch";

const router = express.Router();

function todayInTZ(tz) {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "America/Toronto",
      year: "numeric", month: "2-digit", day: "2-digit"
    });
    const parts = fmt.formatToParts(now).reduce((a,p)=>({...a,[p.type]:p.value}),{});
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return new Date().toISOString().slice(0,10);
  }
}

function firstName(full) {
  if (!full) return null;
  return full.split(" ")[0];
}

async function askOpenAI(content) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Write a short, warm birthday DM. No emojis. No links. No pitch. One or two sentences. Natural tone. Canadian audience." },
        { role: "user", content }
      ],
      temperature: 0.6,
      max_tokens: 100
    })
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.choices?.[0]?.message?.content?.trim() || null;
}

async function writeDraft(lead, text) {
  const row = {
    workspace_id: null,
    lead_id: lead.id,
    platform: (lead.platform || "linkedin").toLowerCase(),
    track: "greeting",
    kind: "dm",
    target_url: null,
    post_excerpt: null,
    body: text.trim(),
    status: "draft"
  };
  const { error } = await supabase.from("messages").insert(row);
  if (error) throw new Error(error.message);
}

// POST /api/birthdays/run  body: { tz?: "America/Toronto" }
router.post("/run", async (req, res) => {
  try {
    const tz = req.body?.tz || "America/Toronto";
    const ymd = todayInTZ(tz);
    const mmdd = ymd.slice(5);

    const { data: leads, error } = await supabase
      .from("leads")
      .select("*")
      .not("birthday", "is", null);

    if (error) return res.status(500).json({ error: error.message });

    const todays = (leads || []).filter(l => String(l.birthday || "").slice(5) === mmdd);

    let created = 0;
    for (const lead of todays) {
      if (lead.do_not_contact) continue;

      // once per year
      const year = ymd.slice(0,4);
      const { data: sent } = await supabase
        .from("messages")
        .select("id, created_at")
        .eq("lead_id", lead.id)
        .eq("track", "greeting")
        .gte("created_at", `${year}-01-01`)
        .lte("created_at", `${year}-12-31`)
        .limit(1);
      if (sent && sent.length) continue;

      const name = firstName(lead.full_name) || lead.username || "";
      const facts = [
        name ? `Name=${name}` : null,
        lead.tags ? `Tags=${lead.tags.slice(0,120)}` : null,
        lead.bio ? `Bio=${lead.bio.slice(0,120)}` : null
      ].filter(Boolean).join(" | ");

      const prompt = `Write a birthday DM for ${name || "this person"}. Keep it 1–2 sentences. No sales. No links. ${facts ? "Context: " + facts : ""}`;

      let text = await askOpenAI(prompt);

      if (!text || text.length < 20 || text.length > 240 || /http(s)?:\/\//i.test(text)) {
        text = name
          ? `Happy birthday ${name}. Hope you get a bit of time for yourself today.`
          : `Happy birthday. Hope you get a bit of time for yourself today.`;
      }

      await writeDraft(lead, text);
      created++;
    }

    res.json({ ok: true, birthdays_today: todays.length, drafts_created: created });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

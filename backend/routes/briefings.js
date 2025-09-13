import express from "express";
import OpenAI from "openai";
import { supabase } from "../lib/supabase.js";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

router.get("/briefings/:leadId", async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const { data: L, error: le } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (le || !L) return res.status(404).json({ ok: false, error: "lead not found" });

    const { data: msgs } = await supabase
      .from("messages")
      .select("platform,kind,body,status,created_at,sent_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })
      .limit(200);

    const { data: reps } = await supabase
      .from("replies")
      .select("platform,text,from_lead,created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })
      .limit(200);

    const user = `
Lead:
Name: ${L.full_name || ""}
Title: ${L.title || ""}
Bio: ${L.bio || ""}
Tags: ${L.tags || ""}
Track: ${L.track || ""}

Messages:
${(msgs || []).map(m => `- [${m.platform}|${m.kind}|${m.status}] ${m.body}`).join("\n")}

Replies:
${(reps || []).map(r => `- [${r.platform}] ${r.text}`).join("\n")}

Build a concise prep brief for a Canadian advisor.
Include likely interest, hot buttons, risks, first 3 questions, two direction options and one closing CTA.
`.trim();

    let summary = "Brief not available.";
    try {
      const resp = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a Canadian financial advisor assistant. Be concise and practical." },
          { role: "user", content: user }
        ],
        temperature: 0.5,
        max_tokens: 450
      });
      summary = resp.choices?.[0]?.message?.content?.trim() || summary;
    } catch {}

    return res.json({ ok: true, lead_id: leadId, brief: summary });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

export default router;

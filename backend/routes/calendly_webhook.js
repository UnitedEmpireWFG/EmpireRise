import express from "express";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

// POST /api/calendly/webhook
// Receives Calendly event payload and pauses outreach for the matched lead
router.post("/webhook", async (req, res) => {
  try {
    const payload = req.body || {};
    const email =
      payload?.payload?.invitee?.email ||
      payload?.invitee?.email ||
      payload?.email ||
      null;

    const start_time =
      payload?.payload?.event?.start_time ||
      payload?.event?.start_time ||
      null;

    if (!email) {
      return res.status(200).json({ ok: true, ignored: "no email" });
    }

    const { data: leads, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .ilike("email", email);

    if (leadErr) return res.status(500).json({ error: leadErr.message });

    const lead = leads?.[0] || null;

    if (lead) {
      await supabase.from("contact_events").insert({
        lead_id: lead.id,
        kind: "booked",
        platform: "calendly",
        note: start_time || null
      });

      await supabase
        .from("messages")
        .update({ status: "paused" })
        .eq("lead_id", lead.id)
        .in("status", ["draft", "approved"]);
    }

    return res.json({ ok: true, matched: !!lead });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;

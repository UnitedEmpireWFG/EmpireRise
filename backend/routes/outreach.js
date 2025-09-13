import express from "express";
import { supabase } from "../lib/supabase.js";
import { makeTransport } from "../providers/email.js";
const router = express.Router();

router.get("/queue", async (req, res) => {
  const { data: next } = await supabase
    .from("messages")
    .select("id, lead_id, content, status")
    .eq("status","draft")
    .eq("approved", true)
    .lte("scheduled_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (!next) return res.json({ message: "" });
  await supabase.from("messages").update({ status: "queued" }).eq("id", next.id);
  res.json({ message: next.content, lead_id: next.lead_id, message_id: next.id });
});

router.post("/mark-sent", async (req, res) => {
  const { message_id, lead_id } = req.body || {};
  if (message_id) await supabase.from("messages").update({ status: "sent" }).eq("id", message_id);
  if (lead_id) await supabase.from("leads").update({ status: "messaged" }).eq("id", lead_id);
  res.json({ ok: true });
});

router.post("/email/send", async (req, res) => {
  const { to, subject, text, html } = req.body || {};
  try {
    const tx = makeTransport();
    await tx.sendMail({ from: process.env.SMTP_USER, to, subject, text, html });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

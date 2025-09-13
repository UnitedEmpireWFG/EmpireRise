import express from "express";
import supa from "../lib/supabase.js";

const router = express.Router();

/**
 * POST /api/queue/approve
 * Body: { ids: string[], startAt?: ISO_datetime }
 * Sets messages(status='approved', due_at=startAt|now)
 */
router.post("/approve", async (req, res) => {
  try {
    const { ids, startAt } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, error: "ids array required" });
    }

    // Update and return the affected rows
    const { data, error } = await supa
      .from("messages")
      .update({
        status: "approved",
        due_at: startAt || new Date().toISOString(),
      })
      .in("id", ids)
      .select("id, platform, status, due_at"); // <-- IMPORTANT

    if (error) throw error;

    res.json({ ok: true, updated: (data?.length ?? 0), items: data || [] });
  } catch (err) {
    console.error("approve error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

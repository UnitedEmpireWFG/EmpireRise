import { Router } from "express";
import { supa } from "../db.js";
const r = Router();

r.get("/last-inbound/:contact_id", async (req, res) => {
  try {
    const { contact_id } = req.params;
    const { data, error } = await supa
      .from("interactions")
      .select("body, created_at")
      .eq("contact_id", contact_id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    res.json({ ok: true, last: data || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
export default r;

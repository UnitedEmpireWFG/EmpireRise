import express from "express";
import supabase from "../lib/supabase.js";

const router = express.Router();

router.post("/webhook", express.json(), async (req, res) => {
  try {
    const ev = req.body || {};
    const email = ev?.payload?.invitee?.email;
    if (!email) return res.json({ ok:true });

    // find contact by email in merged_handles or future email field
    const { data: hits } = await supabase
      .from("contacts")
      .select("id,merged_handles")
      .contains("merged_handles", { email });

    if (hits && hits.length) {
      const id = hits[0].id;
      await supabase.from("contacts").update({ stage:"booked" }).eq("id", id);
      await supabase.from("logs").insert({ user_id:"default", contact_id:id, kind:"booked" });
    }
    res.json({ ok:true });
  } catch(e) {
    res.status(200).json({ ok:true });
  }
});

export default router;

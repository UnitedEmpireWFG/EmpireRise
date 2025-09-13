import express from "express";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

router.get("/export/last-30-days.csv", async (_req, res) => {
  try {
    const { data } = await supabase
      .from("messages")
      .select("id, lead_id, platform, status, kind, body, created_at, approved_at, scheduled_at, sent_at, fail_reason, error_code")
      .gte("created_at", new Date(Date.now() - 30*24*60*60*1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    const rows = data || [];
    const cols = ["id","lead_id","platform","status","kind","body","created_at","approved_at","scheduled_at","sent_at","fail_reason","error_code"];
    const header = cols.join(",");
    const lines = [header];
    for (const r of rows) {
      const line = cols.map(c => {
        const v = r[c] == null ? "" : String(r[c]).replace(/"/g,'""');
        return `"${v}"`;
      }).join(",");
      lines.push(line);
    }
    const csv = lines.join("\n");
    res.setHeader("Content-Type","text/csv; charset=utf-8");
    res.send(csv);
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e.message || e) });
  }
});

export default router;

import express from "express";
import supa from "../lib/supabase.js";

const router = express.Router();

/**
 * CSV helper – escapes quotes and wraps cells as needed
 */
function toCSV(rows) {
  if (!rows || rows.length === 0) return "id\n"; // minimal valid CSV
  const cols = Object.keys(rows[0]);
  const header = cols.join(",");
  const lines = rows.map(r =>
    cols
      .map(c => {
        let v = r[c];
        if (v === null || v === undefined) v = "";
        if (typeof v === "object") v = JSON.stringify(v);
        v = String(v);
        // escape quotes
        if (v.includes("\"") || v.includes(",") || v.includes("\n")) {
          v = "\"" + v.replace(/"/g, "\"\"") + "\"";
        }
        return v;
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

/**
 * GET /api/export/last-30-days.csv
 * Tries to export messages from the last 30 days. It is schema-safe:
 * - First tries a friendly column list.
 * - If that fails (missing columns), falls back to select("*").
 */
router.get("/last-30-days.csv", async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Attempt 1: explicit columns (works on most setups we've created)
    let rows = null;
    {
      const { data, error } = await supa
        .from("messages")
        .select("id,lead_id,platform,kind,body,status,created_at,approved_at,due_at,sent_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (!error) rows = data;
    }

    // Attempt 2: fallback to select("*") if columns differ
    if (!rows) {
      const { data, error } = await supa
        .from("messages")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      rows = data || [];
    }

    const csv = toCSV(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=last-30-days.csv");
    res.send(csv);
  } catch (e) {
    // Never crash the app because of export; return an empty CSV with an error comment
    const msg = (e && e.message) ? e.message : String(e);
    const csv = `error\n"${msg.replace(/"/g,'""')}"\n`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=last-30-days.csv");
    res.status(200).send(csv);
  }
});

export default router;

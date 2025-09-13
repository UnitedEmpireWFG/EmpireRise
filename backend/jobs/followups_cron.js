import { supabase } from "../lib/supabase.js";

function addDays(iso, days) {
  const d = new Date(iso || Date.now());
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function startFollowupsCron() {
  const interval = Number(process.env.FOLLOWUPS_INTERVAL_MIN || 10) * 60 * 1000;
  async function run() {
    try {
      const { data: recentRep } = await supabase
        .from("replies")
        .select("lead_id, text, created_at")
        .gte("created_at", addDays(new Date().toISOString(), -7))
        .order("created_at", { ascending: false })
        .limit(500);

      const declines = new Set();
      const circleBack = new Set();
      for (const r of recentRep || []) {
        const t = (r.text || "").toLowerCase();
        if (t.includes("not interested") || t.includes("no thanks") || t.includes("stop messaging")) declines.add(r.lead_id);
        if (t.includes("few weeks") || t.includes("later") || t.includes("next month")) circleBack.add(r.lead_id);
      }
      for (const id of declines) {
        await supabase.from("leads").update({ cool_off_until: addDays(new Date().toISOString(), 30) }).eq("id", id);
      }
      for (const id of circleBack) {
        await supabase.from("leads").update({ next_touch_at: addDays(new Date().toISOString(), 21) }).eq("id", id);
      }

      const { data: due } = await supabase
        .from("leads")
        .select("*")
        .lte("next_touch_at", new Date().toISOString())
        .eq("dnc", false)
        .limit(100);

      const rows = [];
      for (const L of due || []) {
        const msg = L.track === "recruit"
          ? "Quick check in. Would this week be any better to chat about your goals?"
          : "Wanted to circle back on your money goals. Open to a quick chat this week?";
        rows.push({
          lead_id: L.id,
          platform: L.platform || "linkedin",
          status: "draft",
          kind: "dm",
          track: L.track || "client",
          body: msg
        });
        await supabase.from("leads").update({ next_touch_at: addDays(new Date().toISOString(), 14) }).eq("id", L.id);
      }
      if (rows.length) await supabase.from("messages").insert(rows);
    } catch (e) {
      await supabase.from("logs").insert([{ level: "error", scope: "followups_cron", detail: String(e.message || e) }]);
    }
  }
  run();
  setInterval(run, interval);
}


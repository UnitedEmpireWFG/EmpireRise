import { supabase } from "../lib/supabase.js";
import fs from "fs";
import path from "path";

export async function runWarmupBatch() {
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .in("status", ["new","warming"])
    .order("quality", { ascending: false })
    .limit(50);

  for (const l of leads || []) {
    await supabase.from("messages").insert({
      lead_id: l.id,
      platform: l.platform,
      direction: "out",
      status: "draft",
      content: suggestWarmup(l)
    });
    await supabase.from("leads").update({ status: "warming" }).eq("id", l.id);
  }
}

export function suggestWarmup(l) {
  if (l.platform === "linkedin") return "Plan to visit profile and like a recent post. Then send a friendly opener.";
  if (l.platform === "instagram") return "Plan to view a story and react once. Then send a friendly opener.";
  if (l.platform === "facebook") return "Plan to like a recent post and leave a short relevant comment.";
  return "Plan to send a friendly opener.";
}

function loadCaps(){
  const p = path.resolve(process.cwd(), "backend/config/caps.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export async function runReengagement() {
  const { data: stalled } = await supabase
    .from("leads")
    .select("*")
    .eq("status","messaged");
  for (const l of stalled || []) {
    await supabase.from("messages").insert({
      lead_id: l.id,
      platform: l.platform,
      direction: "out",
      status: "draft",
      content: "Circling back. Open to a quick chat this week, or should I check in next month?"
    });
  }
}

export async function dispatchScheduled(){
  const caps = loadCaps();
  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("messages")
    .select("id, lead_id, platform, content, status, scheduled_at")
    .eq("approved", true)
    .eq("status","queued")
    .lte("scheduled_at", nowIso)
    .limit(50);

  const hourlyCounts = {};
  for (const m of due || []) {
    const { data: l } = await supabase.from("leads").select("do_not_contact").eq("id", m.lead_id).maybeSingle();
    if (l && l.do_not_contact) {
      await supabase.from("messages").update({ status: "failed" }).eq("id", m.id);
      continue;
    }
    const hour = new Date(m.scheduled_at).getHours();
    const key = `${m.platform}-${hour}`;
    const cap = caps[m.platform||"generic"]?.hourly || 10;
    hourlyCounts[key] = hourlyCounts[key] || 0;
    if (hourlyCounts[key] >= cap) continue;
    hourlyCounts[key]++;
    // stays queued for extension paste-and-send
  }
}


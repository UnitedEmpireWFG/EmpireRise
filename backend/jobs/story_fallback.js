import cron from "node-cron";
import { supabase } from "../lib/supabase.js";

export function startStoryFallback() {
  // run hourly
  cron.schedule("0 * * * *", async () => {
    try {
      // find leads with last contact older than fallback window and no reply
      const { data: settings } = await supabase.from("settings").select("*").limit(1).maybeSingle();
      const hours = settings?.story_reply_fallback_hours || 48;

      // naive selection, you can refine later
      const since = new Date(Date.now() - hours*3600*1000).toISOString();

      // get candidate DMs that were sent but did not get a reply
      const { data: dms } = await supabase
        .from("messages")
        .select("lead_id, platform")
        .eq("kind","dm")
        .eq("status","sent")
        .gte("created_at", since);

      const leadIds = [...new Set((dms||[]).map(d=>d.lead_id).filter(Boolean))];
      if (!leadIds.length) return;

      // write a story-reply draft for each lead
      for (const lead_id of leadIds){
        await supabase.from("messages").insert({
          workspace_id: null,
          lead_id,
          platform: "instagram",
          track: "convo",
          kind: "dm",
          target_url: null,
          post_excerpt: null,
          body: "Saw your story earlier. How is your week going so far?",
          status: "draft"
        });
      }
      console.log("[story_fallback] drafted", leadIds.length);
    } catch (e) {
      console.error("[story_fallback]", e.message);
    }
  });
}


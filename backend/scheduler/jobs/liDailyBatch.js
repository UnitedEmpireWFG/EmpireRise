import cron from "node-cron";
import { supa } from "../../db.js";
import globalUserCache from "../../services/users/cache.js";

function parseCron(cronExpr) {
  // basic guard
  return typeof cronExpr === "string" && cronExpr.trim().split(" ").length >= 5
    ? cronExpr.trim()
    : "9 0 * * *"; // 00:09 every day default
}

export function initLiDailyBatch(cache = globalUserCache) {
  // Read settings for CRON + flag
  let cronExpr = "9 0 * * *";
  let enabled = true;

  const prime = async () => {
    const { data } = await supa
      .from("app_settings")
      .select("li_batch_cron, li_batch_enabled")
      .eq("id", 1)
      .maybeSingle();

    if (data) {
      enabled = !!data.li_batch_enabled;
      cronExpr = parseCron(data.li_batch_cron);
    }
  };

  const task = cron.schedule(cronExpr, async () => {
    if (!enabled) return;
    try {
      await cache.refresh();
      const users = cache.list();

      // Example: seed N queue items for each enabled user (customize as needed)
      for (const u of users) {
        if (!u.li_daily_enabled) continue;
        const qty = Number(u.li_daily_quota ?? 10);

        // Insert placeholder “assist LI” rows; your real logic may differ
        const payload = Array.from({ length: qty }, () => ({
          platform: "linkedin",
          status: "scheduled",
          scheduled_at: new Date().toISOString(),
          meta: { kind: "li_daily_batch" }
        }));
        await supa.from("queue").insert(payload);
      }
    } catch (e) {
      console.log("[liDailyBatch] error:", e.message);
    }
  });

  // re-arm the job whenever settings change
  const rearm = async () => {
    try {
      await prime();
      task.stop();
      task.schedule(parseCron(cronExpr));
      console.log("liDailyBatch re-armed:", cronExpr, enabled ? "(enabled)" : "(disabled)");
    } catch (e) {
      console.log("liDailyBatch re-arm error:", e.message);
    }
  };

  // arm on boot
  prime().then(() => {
    task.start();
    console.log("liDailyBatch initialized");
  });

  // optional: poll settings every 5 min to rearm if changed
  setInterval(rearm, 5 * 60 * 1000);
}

export default { initLiDailyBatch };

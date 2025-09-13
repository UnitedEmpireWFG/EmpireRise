// backend/jobs/birthday_cron.js
import cron from "node-cron";
import fetch from "node-fetch";

export function startBirthdayCron() {
  // Runs every day at 09:15
  cron.schedule("15 9 * * *", async () => {
    try {
      const r = await fetch("http://127.0.0.1:8787/api/birthdays/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tz: "America/Toronto" })
      });
      await r.text(); // consume
      console.log("[birthday_cron] triggered");
    } catch (e) {
      console.error("[birthday_cron] error", e.message);
    }
  });
}


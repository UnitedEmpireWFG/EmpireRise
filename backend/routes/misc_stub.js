import { Router } from "express";
const r = Router();

r.get("/settings/get", (_req, res) => {
  res.json({
    ok: true,
    settings: {
      li_daily_limit: 85,
      li_weekly_connects: 200,
      li_weekly_msgs: 500,
      ig_daily_actions: 120,
      windows: [
        { start: "09:00", end: "12:00" },
        { start: "14:00", end: "18:00" }
      ]
    }
  });
});

r.get("/lead/list", (_req, res) => {
  res.json({ ok: true, leads: [] });
});

export default r;

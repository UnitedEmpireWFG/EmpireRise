import { Router } from "express";
import { supa } from "../db.js";

const r = Router();

// Hard caps (you can later move to DB if needed)
const CAPS = {
  linkedin:  { daily: 85,  connects_week: 200, msgs_week: 500 },
  instagram: { daily: 120 },
  facebook:  { daily: 100 }
};

// Some safe defaults if nothing saved yet
const DEFAULTS = {
  weekly_target:        6,     // appts/week
  working_days:         5,     // Mon–Fri
  conversion_rate:      1.5,   // % contact -> appt (worst-case)
  linkedin_weight:      0.34,  // how we split volume across platforms
  instagram_weight:     0.33,
  facebook_weight:      0.33,
  linkedin_daily:       40,
  instagram_daily:      40,
  facebook_daily:       35,
  linkedin_connected:   "false",
  instagram_connected:  "false",
  facebook_connected:   "false"
};

// Helper to read all settings into a plain object
async function getAllSettings() {
  const { data, error } = await supa.from("app_settings").select("key,value");
  if (error) throw new Error(error.message);
  const obj = {};
  for (const row of data || []) obj[row.key] = row.value;
  return obj;
}

// GET /api/settings → { settings, caps, defaults }
r.get("/", async (_req, res) => {
  try {
    const obj = await getAllSettings();
    // Merge defaults over DB so UI always has a value
    const settings = { ...DEFAULTS, ...obj };
    // Coerce numbers
    ["weekly_target","working_days","conversion_rate",
     "linkedin_weight","instagram_weight","facebook_weight",
     "linkedin_daily","instagram_daily","facebook_daily"
    ].forEach(k => {
      if (settings[k] != null) settings[k] = Number(settings[k]);
    });
    res.json({ ok: true, settings, caps: CAPS, defaults: DEFAULTS });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/settings  (save whole object)
r.post("/", async (req, res) => {
  try {
    const settings = req.body || {};
    const rows = Object.entries(settings).map(([key, value]) => ({ key, value }));
    const { error } = await supa.from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/settings/connected  { platform, connected: true|false }
// Allows OAuth callbacks to mark connection status
r.post("/connected", async (req, res) => {
  try {
    const { platform, connected } = req.body || {};
    const key = `${platform}_connected`;
    if (!["linkedin","instagram","facebook"].includes(platform)) {
      return res.status(400).json({ ok:false, error: "invalid platform" });
    }
    const val = connected ? "true" : "false";
    const { error } = await supa.from("app_settings").upsert([{ key, value: val }], { onConflict: "key" });
    if (error) throw new Error(error.message);
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

export default r;

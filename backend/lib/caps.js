import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const capsPath = path.join(__dirname, "../config/caps.json")

function loadCaps() {
  try {
    return JSON.parse(fs.readFileSync(capsPath, "utf8"))
  } catch {
    return {}
  }
}

export function getCaps() {
  const c = loadCaps()
  return {
    timezone: c.timezone || "America/Toronto",
    quiet_hours: c.quiet_hours || { start: "21:00", end: "08:00" },
    platforms: {
      linkedin:  { daily_msgs: 100, weekly_msgs: 500, weekly_adds: 200, ...((c.platforms||{}).linkedin  || {}) },
      instagram: { daily_msgs: 80,  weekly_msgs: 300,                   ...((c.platforms||{}).instagram || {}) },
      facebook:  { daily_msgs: 60,  weekly_msgs: 240,                   ...((c.platforms||{}).facebook  || {}) },
      x:         { daily_msgs: 60,  weekly_msgs: 240,                   ...((c.platforms||{}).x         || {}) },
      threads:   { daily_msgs: 60,  weekly_msgs: 240,                   ...((c.platforms||{}).threads   || {}) }
    }
  }
}


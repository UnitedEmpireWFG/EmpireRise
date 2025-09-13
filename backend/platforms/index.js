import linkedin from "./linkedin.js"
import instagram from "./instagram.js"
import facebook from "./facebook.js"
import x from "./x.js"
import threads from "./threads.js"
import tiktok from "./tiktok.js"
import reddit from "./reddit.js"
import pinterest from "./pinterest.js"
import youtube from "./youtube.js"

export const adapters = {
  linkedin,
  instagram,
  facebook,
  x,
  threads,
  tiktok,
  reddit,
  pinterest,
  youtube
}

export function planForPlatform(platform, lead) {
  const key = String(platform || "").toLowerCase()
  const a = adapters[key]
  if (!a) return null
  return a.plan(lead)
}

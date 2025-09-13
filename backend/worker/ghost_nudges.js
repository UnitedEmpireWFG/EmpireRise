// backend/worker/ghost_nudges.js
import { supa } from "../db.js"

async function listGhosts() {
  const cutoff = new Date(Date.now() - 4*24*3600*1000).toISOString() // 4 days
  const { data } = await supa
    .from("conv_threads")
    .select("id, contact_id, platform, last_event_at, state")
    .lte("last_event_at", cutoff)
    .neq("state","booked")
    .limit(50)
  return data || []
}

async function enqueueNudge(thread) {
  const text = "Still makes sense to explore this, or should we park it for now?"
  await supa.from("queue").insert({
    platform: thread.platform, contact_id: thread.contact_id,
    status: "approved", scheduled_at: new Date().toISOString(),
    payload: { text, kind: "nudge" }
  })
}

export function startGhostNudgesCron() {
  setInterval(async () => {
    const ghosts = await listGhosts()
    await Promise.all(ghosts.map(enqueueNudge))
  }, 60*60*1000) // hourly
}

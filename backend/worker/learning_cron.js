// backend/worker/learning_cron.js
import { cullLosers } from "../lib/ab_test.js"
import { supa } from "../db.js"

async function updateTimingHints() {
  // compute reply rate by hour-of-day for last 14 days
  const since = new Date(Date.now() - 14*86400000).toISOString()
  const { data: assists } = await supa
    .from("conv_messages")
    .select("id, created_at, thread_id")
    .eq("role","assistant")
    .gte("created_at", since)

  const byHour = Array(24).fill(0).map(() => ({ sent:0, replies:0 }))
  for (const m of assists || []) {
    const hr = new Date(m.created_at).getHours()
    byHour[hr].sent++

    const { data: reply } = await supa
      .from("conv_messages")
      .select("id, created_at")
      .eq("thread_id", m.thread_id)
      .eq("role","user")
      .gt("created_at", m.created_at)
      .lte("created_at", new Date(new Date(m.created_at).getTime() + 24*3600*1000).toISOString())
      .limit(1)
    if (reply && reply.length) byHour[hr].replies++
  }

  // store to a lightweight table-less cache inside app_settings.metadata
  const rates = byHour.map((r,i) => ({ hour:i, sent:r.sent, replies:r.replies, rate: r.sent ? r.replies/r.sent : 0 }))
  const hot = rates
    .slice()
    .sort((a,b) => b.rate - a.rate)
    .slice(0, 4)
    .map(x => x.hour)

  const { data: cur } = await supa
    .from("app_settings")
    .select("id, timezone")
    .order("updated_at",{ascending:false})
    .limit(1)

  const row = cur && cur[0]
  if (row) {
    await supa.from("app_settings").update({
      metadata: { hot_hours: hot }   // you can add "metadata jsonb" to app_settings if you want; if not, skip this write.
    }).eq("id", row.id).catch(()=>{})
  }
}

export function startLearningCron() {
  const SIX_HOURS = 6 * 3600 * 1000
  const job = async () => {
    try { await cullLosers() } catch {}
    try { await updateTimingHints() } catch {}
  }
  setTimeout(job, 10_000)       // first run shortly after boot
  setInterval(job, SIX_HOURS)   // then every 6 hours
}

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import { supa } from '../db.js'
import { jitterMs, typePause, withinHumanWindow, sleep } from '../services/pacing.js'
import { sendInstagramFromQueue } from '../services/channels/instagram.js'
import { sendLinkedInFromQueue }  from '../services/channels/linkedin.js'
import { sendFacebookFromQueue }  from '../services/channels/facebook.js'

dayjs.extend(utc); dayjs.extend(timezone)

function pickSender(platform) {
  if (platform === 'instagram') return sendInstagramFromQueue
  if (platform === 'linkedin')  return sendLinkedInFromQueue
  if (platform === 'facebook')  return sendFacebookFromQueue
  return null
}

export async function startGrowthScheduler() {
  loop().catch(() => {})
  async function loop() {
    while (true) {
      try { await tickOnce() } catch (e) { console.log('[scheduler error]', e.message) }
      await sleep(30_000 + Math.floor(Math.random() * 20_000)) // 30–50s between loops
    }
  }
}

async function tickOnce() {
  const { data: sRows } = await supa.from('app_settings').select('*').limit(1)
  const s = (sRows && sRows[0]) || {}
  const tz = s.timezone || process.env.TZ || 'America/Edmonton'
  if (!withinHumanWindow(tz)) return

  const perTick = Math.max(1, Number(s.per_tick ?? 3))
  const mix = s.platform_mix || { linkedin:50, instagram:30, facebook:20 }

  // simple sampler by mix
  const basket = []
  for (let i=0;i<perTick;i++) {
    const rnd = Math.random() * 100
    const li = mix.linkedin || 0
    const ig = li + (mix.instagram || 0)
    if (rnd < li) basket.push('linkedin')
    else if (rnd < ig) basket.push('instagram')
    else basket.push('facebook')
  }

  for (const platform of basket) {
    const sender = pickSender(platform)
    if (!sender) continue

    // caps check: compute remaining today per platform (simple: compare sent_log counts)
    const today = dayjs().tz(tz).startOf('day').toISOString()
    const { data: sentToday } = await supa
      .from('sent_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', today)
      .eq('platform', platform)

    const capKey = platform === 'instagram' ? 'cap_instagram' : platform === 'linkedin' ? 'cap_linkedin' : 'cap_facebook'
    const cap = Math.max(0, Number(s[capKey] ?? (platform === 'linkedin' ? 80 : 60)))
    if ((sentToday?.length || 0) >= cap) continue

    // one item
    const { data: items } = await supa.from('queue')
      .select('id,user_id,contact_id,platform,payload,status,scheduled_at')
      .eq('platform', platform)
      .in('status', ['approved', 'ready'])
      .order('scheduled_at', { ascending: true, nullsFirst: true })
      .limit(1)

    if (!items?.length) continue

    const q = items[0]
    const payload = typeof q.payload === 'string' ? safeJson(q.payload) : (q.payload || {})
    const text = String(payload?.text || '').trim()
    if (!text) continue

    const { data: contact } = await supa.from('contacts').select('*').eq('id', q.contact_id).maybeSingle()
    if (!contact) { await markError(q.id, 'contact_missing'); continue }

    // pre-send delay
    await sleep(jitterMs(1400, 0.6))
    try {
      await sender({ queueRow: q, contact, text })
      await supa.from('queue').update({ status:'sent' }).eq('id', q.id)
      await supa.from('sent_log').insert({
        queue_id: q.id, user_id: q.user_id, contact_id: q.contact_id, platform, campaign: payload.campaign || 'outreach'
      })
    } catch (e) {
      await markError(q.id, e.message || 'send_failed')
      await supa.from('sent_log').insert({
        queue_id: q.id, user_id: q.user_id, contact_id: q.contact_id, platform, campaign: payload.campaign || 'outreach', error: String(e.message || e)
      })
    }
  }
}

function safeJson(x){ try{ return JSON.parse(x) } catch { return null } }
async function markError(id, error){
  await supa.from('queue').update({ status:'error', error: String(error).slice(0, 240) }).eq('id', id)
}

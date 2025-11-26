import { supa } from '../db.js'
import { timePolicy } from '../services/time_windows.js'
import { enqueueWarmup } from '../services/helpers/enqueue.js'

import { LinkedInSmart } from '../services/driver_linkedin_smart.js'
import { FacebookSmart } from '../services/driver_facebook_smart.js'
import { InstagramSmart } from '../services/driver_instagram_smart.js'

const nap = ms => new Promise(r => setTimeout(r, ms))

/* ---------- DISCOVERY (24/7 allowed by default, gated by canDiscoverNow) ---------- */
export async function runDiscoveryLinkedInSmart() {
  if (!timePolicy.canDiscoverNow()) return { ok: true, added: 0 }
  if (String(process.env.LI_SOURCING_ENABLED || 'true') !== 'true') return { ok: true, added: 0 }

  const cap = Number(process.env.LI_SOURCING_DAILY_CAP || 20)
  const li = new LinkedInSmart()
  try {
    const items = await li.suggestedPeopleCanada(cap * 2)
    let added = 0
    for (const m of items) {
      if (added >= cap) break
      const row = {
        platform: 'linkedin',
        handle: m.handle,
        first_name: null, last_name: null,
        headline: m.headline || null,
        location: m.location || null,
        open_to_work: !!m.open_to_work,
        status: 'new'
      }
      const { error } = await supa.from('candidates').insert(row)
      if (!error) added++
    }
    return { ok: true, added }
  } finally {
    await li.close().catch(() => {})
  }
}

export async function runDiscoveryFacebookSmart() {
  if (!timePolicy.canDiscoverNow()) return { ok: true, added: 0 }
  if (String(process.env.FB_SOURCING_ENABLED || 'true') !== 'true') return { ok: true, added: 0 }

  const cap = Number(process.env.FB_SOURCING_DAILY_CAP || 10)
  const fb = new FacebookSmart()
  const items = await fb.suggestedCanada({
    limit: cap * 2,
    requireMutuals: String(process.env.FB_REQUIRE_MUTUALS || 'true') === 'true'
  })
  let added = 0
  for (const m of items) {
    if (added >= cap) break
    const row = { platform: 'facebook', handle: m.handle, mutuals: m.mutuals || 0, status: 'new' }
    const { error } = await supa.from('candidates').insert(row)
    if (!error) added++
  }
  await fb.close().catch(() => {})
  return { ok: true, added }
}

export async function runDiscoveryInstagramSmart() {
  if (!timePolicy.canDiscoverNow()) return { ok: true, added: 0 }
  if (String(process.env.IG_SOURCING_ENABLED || 'true') !== 'true') return { ok: true, added: 0 }

  const cap = Number(process.env.IG_SOURCING_DAILY_CAP || 12)
  const ig = new InstagramSmart()
  const items = await ig.suggestedCanada({
    limit: cap * 2,
    requireMutuals: String(process.env.IG_REQUIRE_MUTUALS || 'true') === 'true'
  })
  let added = 0
  for (const m of items) {
    if (added >= cap) break
    const row = {
      platform: 'instagram',
      handle: m.handle,
      bio: m.bio?.slice(0, 500) || null,
      mutuals: m.mutuals || 0,
      status: 'new'
    }
    const { error } = await supa.from('candidates').insert(row)
    if (!error) added++
  }
  await ig.close().catch(() => {})
  return { ok: true, added }
}

/* ---------- CONNECT (gated by canConnectNow) ---------- */
export async function runConnectLinkedInSmart() {
  if (!timePolicy.canConnectNow()) return { ok: true, sent: 0 }
  const cap = Number(process.env.LI_CONNECT_DAILY_CAP || 10)
  const { data: rows } = await supa.from('candidates').select('*')
    .eq('platform', 'linkedin').eq('status', 'new').limit(cap)
  if (!rows?.length) return { ok: true, sent: 0 }

  const li = new LinkedInSmart()
  try {
    let sent = 0
    for (const r of rows) {
      try {
        await li.connectNoNote(r.handle) // NO NOTE per your request
        await supa.from('candidates').update({ status: 'requested' }).eq('id', r.id)
        await supa.from('connect_log').insert({ platform: 'linkedin', handle: r.handle, action: 'request' })
        sent++
        await nap(1800 + Math.random() * 900)
      } catch (e) {
        await supa.from('candidates').update({ status: 'error' }).eq('id', r.id)
        await supa.from('connect_log').insert({ platform: 'linkedin', handle: r.handle, action: 'request', ok: false, error: String(e?.message || e) })
      }
    }
    return { ok: true, sent }
  } finally {
    await li.close().catch(() => {})
  }
}

export async function runConnectFacebookSmart() {
  if (!timePolicy.canConnectNow()) return { ok: true, sent: 0 }
  const cap = Number(process.env.FB_FRIEND_DAILY_CAP || 6)
  const { data: rows } = await supa.from('candidates').select('*')
    .eq('platform', 'facebook').eq('status', 'new').limit(cap)
  if (!rows?.length) return { ok: true, sent: 0 }

  const fb = new FacebookSmart()
  let sent = 0
  for (const r of rows) {
    try {
      await fb.sendFriendRequest(r.handle)
      await supa.from('candidates').update({ status: 'requested' }).eq('id', r.id)
      await supa.from('connect_log').insert({ platform: 'facebook', handle: r.handle, action: 'request' })
      sent++
      await nap(2200 + Math.random() * 600)
    } catch (e) {
      await supa.from('candidates').update({ status: 'error' }).eq('id', r.id)
      await supa.from('connect_log').insert({ platform: 'facebook', handle: r.handle, action: 'request', ok: false, error: String(e?.message || e) })
    }
  }
  await fb.close().catch(() => {})
  return { ok: true, sent }
}

export async function runConnectInstagramSmart() {
  if (!timePolicy.canConnectNow()) return { ok: true, sent: 0 }
  const cap = Number(process.env.IG_FOLLOW_DAILY_CAP || 6)
  const { data: rows } = await supa.from('candidates').select('*')
    .eq('platform', 'instagram').eq('status', 'new').limit(cap)
  if (!rows?.length) return { ok: true, sent: 0 }

  const ig = new InstagramSmart()
  let sent = 0
  for (const r of rows) {
    try {
      await ig.follow(r.handle)
      await supa.from('candidates').update({ status: 'requested' }).eq('id', r.id)
      await supa.from('connect_log').insert({ platform: 'instagram', handle: r.handle, action: 'request' })
      sent++
      await nap(1800 + Math.random() * 800)
    } catch (e) {
      await supa.from('candidates').update({ status: 'error' }).eq('id', r.id)
      await supa.from('connect_log').insert({ platform: 'instagram', handle: r.handle, action: 'request', ok: false, error: String(e?.message || e) })
    }
  }
  await ig.close().catch(() => {})
  return { ok: true, sent }
}

/* ---------- ACCEPT → (optionally) AUTO-ENQUEUE (gated by canAutoEnqueueNow) ---------- */
export async function checkLinkedInAcceptsSmart() {
  const cap = Number(process.env.LI_ACCEPT_CHECK_DAILY_CAP || 20)
  const { data: rows } = await supa.from('candidates').select('*')
    .eq('platform', 'linkedin').eq('status', 'requested').limit(cap)
  if (!rows?.length) return { ok: true, accepted: 0 }

  const li = new LinkedInSmart()
  try {
    let accepted = 0
    for (const r of rows) {
      try {
        const ok = await li.isConnected(r.handle)
        if (ok) {
          await supa.from('candidates').update({ status: 'connected' }).eq('id', r.id)
          await supa.from('connect_log').insert({ platform: 'linkedin', handle: r.handle, action: 'accept_detected' })

          if (timePolicy.canAutoEnqueueNow()) {
            const qid = await enqueueWarmup('linkedin', r.handle)
            if (qid) await supa.from('candidates').update({ status: 'queued' }).eq('id', r.id)
          } else {
            await supa.from('candidates').update({ next_action: 'enqueue_warmup' }).eq('id', r.id)
          }
          accepted++
        }
        await nap(900 + Math.random() * 500)
      } catch {}
    }
    return { ok: true, accepted }
  } finally {
    await li.close().catch(() => {})
  }
}

export async function checkFacebookAcceptsSmart() {
  const cap = Number(process.env.FB_ACCEPT_CHECK_DAILY_CAP || 15)
  const { data: rows } = await supa.from('candidates').select('*')
    .eq('platform', 'facebook').eq('status', 'requested').limit(cap)
  if (!rows?.length) return { ok: true, accepted: 0 }

  const fb = new FacebookSmart()
  let accepted = 0
  for (const r of rows) {
    try {
      const ok = await fb.isFriend(r.handle)
      if (ok) {
        await supa.from('candidates').update({ status: 'connected' }).eq('id', r.id)
        await supa.from('connect_log').insert({ platform: 'facebook', handle: r.handle, action: 'accept_detected' })

        if (timePolicy.canAutoEnqueueNow()) {
          const qid = await enqueueWarmup('facebook', r.handle)
          if (qid) await supa.from('candidates').update({ status: 'queued' }).eq('id', r.id)
        } else {
          await supa.from('candidates').update({ next_action: 'enqueue_warmup' }).eq('id', r.id)
        }
        accepted++
      }
      await nap(1000 + Math.random() * 600)
    } catch {}
  }
  await fb.close().catch(() => {})
  return { ok: true, accepted }
}

export async function checkInstagramAcceptsSmart() {
  const cap = Number(process.env.IG_ACCEPT_CHECK_DAILY_CAP || 15)
  const { data: rows } = await supa.from('candidates').select('*')
    .eq('platform', 'instagram').eq('status', 'requested').limit(cap)
  if (!rows?.length) return { ok: true, accepted: 0 }

  const ig = new InstagramSmart()
  let accepted = 0
  for (const r of rows) {
    try {
      const ok = await ig.isFollowing(r.handle)
      if (ok) {
        await supa.from('candidates').update({ status: 'connected' }).eq('id', r.id)
        await supa.from('connect_log').insert({ platform: 'instagram', handle: r.handle, action: 'accept_detected' })

        if (timePolicy.canAutoEnqueueNow()) {
          const qid = await enqueueWarmup('instagram', r.handle)
          if (qid) await supa.from('candidates').update({ status: 'queued' }).eq('id', r.id)
        } else {
          await supa.from('candidates').update({ next_action: 'enqueue_warmup' }).eq('id', r.id)
        }
        accepted++
      }
      await nap(900 + Math.random() * 500)
    } catch {}
  }
  await ig.close().catch(() => {})
  return { ok: true, accepted }
}
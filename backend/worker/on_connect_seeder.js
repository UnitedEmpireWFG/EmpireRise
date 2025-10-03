import { supa, supaAdmin } from '../db.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { LinkedInSmart } from '../drivers/driver_linkedin_smart.js'

const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'
const DISCOVERY_LIMIT = Number(process.env.LI_DISCOVERY_LIMIT_PER_RUN || 20)

export function enqueueDiscovery(userId) {
  // mark a flag on app_settings so the cron below will pick it up quickly
  return supaAdmin.from('app_settings').update({ li_needs_seed: true, updated_at: new Date().toISOString() }).eq('user_id', userId)
}

async function hasCookies(userId) {
  try {
    const p = path.join(COOKIES_DIR, `${userId}.json`)
    await fs.access(p)
    return true
  } catch { return false }
}

async function seedForUser(userId) {
  const cookiesPath = path.join(COOKIES_DIR, `${userId}.json`)
  const okCookies = await hasCookies(userId)
  if (!okCookies) {
    console.log('li_seed_skip_no_cookies', userId)
    return
  }

  const driver = new LinkedInSmart()
  process.env.LI_COOKIES_PATH = cookiesPath
  try {
    const list = await driver.suggestedPeopleCanada(DISCOVERY_LIMIT)
    console.log('li_seed_found', userId, list.length)
    if (list.length) {
      const rows = list.map(p => ({
        user_id: userId,
        source: 'linkedin_suggested',
        li_handle: p.handle,
        name: p.name || null,
        headline: p.headline || null,
        location_text: p.location || null,
        open_to_work: p.open_to_work || false,
        created_at: new Date().toISOString()
      }))
      await supaAdmin.from('prospects').upsert(rows, { onConflict: 'user_id,li_handle' })

      // create simple drafts
      const drafts = rows.slice(0, Math.min(5, rows.length)).map(r => ({
        user_id: r.user_id,
        li_handle: r.li_handle,
        channel: 'linkedin',
        body: `Hi ${r.name?.split(' ')?.[0] || ''} quick intro. Enjoyed your background. Open to connect for 30 seconds?`,
        created_at: new Date().toISOString(),
        status: 'draft'
      }))
      if (drafts.length) await supaAdmin.from('drafts').insert(drafts)
    }
  } catch (e) {
    console.log('li_seed_error', userId, e.message)
  } finally {
    try { await driver.close() } catch {}
  }
}

export async function startOnConnectSeeder() {
  // every 60 seconds check for users that need a seed
  setInterval(async () => {
    try {
      const { data } = await supaAdmin
        .from('app_settings')
        .select('user_id, li_needs_seed')
        .eq('li_needs_seed', true)
        .limit(10)
      const ids = (data || []).map(r => r.user_id)
      for (const uid of ids) {
        await seedForUser(uid)
        await supaAdmin.from('app_settings').update({ li_needs_seed: false, last_li_seed_at: new Date().toISOString() }).eq('user_id', uid)
      }
    } catch (e) {
      console.log('li_seed_scan_error', e.message)
    }
  }, 60_000)
}
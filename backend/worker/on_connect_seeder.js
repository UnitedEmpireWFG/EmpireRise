// backend/worker/on_connect_seeder.js
import { supa, supaAdmin } from '../db.js'
import fs from 'node:fs/promises'
import { getCookieFilePath } from '../lib/linkedinCookies.js'

const DISCOVERY_LIMIT = Number(process.env.LI_DISCOVERY_LIMIT_PER_RUN || 20)

export function enqueueDiscovery(userId) {
  return supaAdmin.from('app_settings')
    .update({ li_needs_seed: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
}

async function hasCookies(userId) {
  try {
    const p = getCookieFilePath(userId)
    await fs.access(p)
    return true
  } catch { return false }
}

async function loadDriver() {
  try {
    const mod = await import('../drivers/driver_linkedin_smart.js')
    return mod.LinkedInSmart
  } catch (e) {
    console.log('li_seed_driver_missing', e.code || e.message)
    return null
  }
}

async function seedForUser(userId) {
  const okCookies = await hasCookies(userId)
  if (!okCookies) { console.log('li_seed_skip_no_cookies', userId); return }

  const LinkedInSmart = await loadDriver()
  if (!LinkedInSmart) { console.log('li_seed_skip_no_driver', userId); return }

  const cookiesPath = getCookieFilePath(userId)
  process.env.LI_COOKIES_PATH = cookiesPath

  const driver = new LinkedInSmart()
  try {
    const list = await driver.suggestedPeopleCanada(DISCOVERY_LIMIT)
    console.log('li_seed_found', userId, Array.isArray(list) ? list.length : 0)
    if (!Array.isArray(list) || !list.length) return

    const rows = list.map(p => ({
      user_id: userId,
      source: 'linkedin_suggested',
      li_handle: p.handle || null,
      name: p.name || null,
      headline: p.headline || null,
      title: p.title || null,
      location: p.location || null,
      region: p.location || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))
    await supaAdmin.from('prospects').upsert(rows, { onConflict: 'user_id,li_handle' })

    const drafts = rows.slice(0, Math.min(5, rows.length)).map(r => ({
      user_id: r.user_id,
      li_handle: r.li_handle,
      platform: 'linkedin',
      body: `Hi ${r.name?.split(' ')?.[0] || ''} — quick intro. Enjoyed your background. Open to connect?`,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))
    if (drafts.length) await supaAdmin.from('drafts').insert(drafts)
  } catch (e) {
    console.log('li_seed_error', userId, e.message)
  } finally {
    try { await driver.close() } catch {}
  }
}

export async function startOnConnectSeeder() {
  setInterval(async () => {
    try {
      const { data } = await supaAdmin
        .from('app_settings')
        .select('user_id')
        .eq('li_needs_seed', true)
        .limit(10)
      const ids = (data || []).map(r => r.user_id)
      for (const uid of ids) {
        await seedForUser(uid)
        await supaAdmin.from('app_settings')
          .update({ li_needs_seed: false, last_li_seed_at: new Date().toISOString() })
          .eq('user_id', uid)
      }
    } catch (e) {
      console.log('li_seed_scan_error', e.message)
    }
  }, 60_000)
}

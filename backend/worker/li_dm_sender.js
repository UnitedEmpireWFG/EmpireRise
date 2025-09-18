import { supa } from '../db.js'
import { LinkedInDriver } from '../services/linkedin_driver.js'
import { timePolicy } from '../services/time_windows.js'
import path from 'node:path'

const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchNextBatch(limit = 15) {
  const { data, error } = await supa
    .from('queue')
    .select('id, contact_id, platform, status, payload, scheduled_at, user_id, campaign')
    .in('status', ['ready', 'approved'])
    .eq('platform', 'linkedin')
    .order('scheduled_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data || []
}

async function markQueue(id, status, error = null) {
  await supa.from('queue').update({ status, error, updated_at: new Date().toISOString() }).eq('id', id)
}

async function getContact(id) {
  const { data } = await supa.from('contacts').select('id, handle').eq('id', id).single()
  return data || null
}

export async function tickLinkedInSender() {
  if (!timePolicy.canSendNow()) return
  try {
    const rows = await fetchNextBatch(15)
    if (!rows.length) return

    const byUser = rows.reduce((m, r) => { (m[r.user_id] ||= []).push(r); return m }, {})

    for (const [userId, items] of Object.entries(byUser)) {
      const cookiesPath = path.join(COOKIES_DIR, `${userId}.json`)
      const driver = new LinkedInDriver({ cookiesPath })
      try {
        await driver.init()

        for (const row of items) {
          try {
            const payload = typeof row?.payload === 'string' ? JSON.parse(row.payload || '{}') : (row?.payload || {})
            const contact = await getContact(row.contact_id)
            const handle = String(contact?.handle || '').trim().toLowerCase()
            const text = String(payload?.text || '').trim()
            if (!handle || !text) { await markQueue(row.id, 'error', 'missing_handle_or_text'); continue }

            await driver.sendMessageToHandle(handle, text)
            await markQueue(row.id, 'sent')
            await sleep(1800 + Math.random() * 900)
          } catch (e) {
            await markQueue(row.id, 'error', String(e?.message || e))
          }
        }
      } catch (e) {
        for (const row of items) await markQueue(row.id, 'error', `driver_init_failed:${String(e?.message || e)}`)
      } finally {
        try { await driver.close?.() } catch {}
      }
    }
  } catch {}
}
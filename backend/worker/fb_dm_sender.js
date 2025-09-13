import { supa } from '../db.js'
import { FacebookDriver } from '../services/facebook_driver.js'
import { timePolicy } from '../services/time_windows.js'

const driver = new FacebookDriver()
const cooldown = Number(process.env.FB_SEND_COOLDOWN_MS || 2200)

function parsePayload(p) {
  if (!p) return {}
  if (typeof p === 'string') {
    try { return JSON.parse(p) } catch { return {} }
  }
  return p
}

async function getContact(id) {
  const { data, error } = await supa
    .from('contacts')
    .select('id, handle, platform')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

async function markQueue(id, status, errorText = null) {
  const patch = { status }
  if (errorText) patch.error = errorText
  await supa.from('queue').update(patch).eq('id', id)
}

export async function tickFacebookSender() {
  if (!timePolicy.canSendNow()) return
  try {
    const { data } = await supa
      .from('queue')
      .select('id, contact_id, platform, status, payload, scheduled_at')
      .eq('platform', 'facebook')
      .in('status', ['approved', 'ready'])
      .order('scheduled_at', { ascending: true })
      .limit(5)

    const rows = data || []
    if (!rows.length) return

    await driver.init()

    for (const q of rows) {
      try {
        const payload = parsePayload(q.payload)
        const contact = await getContact(q.contact_id)
        const username = String(contact?.handle || '').trim()
        const text = String(payload?.text || '').trim()
        if (!username || !text) {
          await markQueue(q.id, 'error', 'missing_username_or_text')
          continue
        }

        await driver.sendMessage(username, text)
        await markQueue(q.id, 'sent')
        await new Promise(r => setTimeout(r, cooldown + Math.random() * 400))
      } catch (e) {
        await markQueue(q.id, 'error', String(e?.message || e))
      }
    }
  } catch {
    // swallow tick errors; next tick retries
  }
}
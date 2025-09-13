import { supa } from '../db.js'
import { LinkedInDriver } from '../services/linkedin_driver.js'
import { timePolicy } from '../services/time_windows.js'

const driver = new LinkedInDriver()
const norm = s => String(s || '').trim().toLowerCase()

async function fetchNextBatch(limit = 5) {
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

async function getContact(contact_id) {
  const { data, error } = await supa
    .from('contacts')
    .select('id, handle, platform')
    .eq('id', contact_id)
    .maybeSingle()
  if (error) throw error
  return data
}

async function markQueue(id, status, errorText = null) {
  const patch = { status }
  if (errorText) patch.error = errorText
  await supa.from('queue').update(patch).eq('id', id)
}

async function logSent(q, contact) {
  try {
    await supa.from('sent_log').insert({
      queue_id: q.id,
      platform: 'linkedin',
      user_id: q.user_id || null,
      contact_id: contact?.id || null,
      campaign: q.campaign || 'outreach'
    })
  } catch {
    // ignore if table not present
  }
}

export async function tickLinkedInSender() {
  if (!timePolicy.canSendNow()) return
  try {
    const rows = await fetchNextBatch(3)
    if (!rows.length) return

    await driver.init()

    for (const row of rows) {
      try {
        const payload = typeof row.payload === 'string'
          ? JSON.parse(row.payload)
          : (row.payload || {})
        const contact = await getContact(row.contact_id)
        const handle = norm(contact?.handle)
        const text = String(payload?.text || '').trim()

        if (!handle || !text) {
          await markQueue(row.id, 'error', 'missing_handle_or_text')
          continue
        }

        await driver.sendMessageToHandle(handle, text)
        await logSent(row, contact)
        await markQueue(row.id, 'sent')

        await new Promise(r => setTimeout(r, 1800 + Math.random() * 900))
      } catch (e) {
        await markQueue(row.id, 'error', String(e?.message || e))
      }
    }
  } catch {
    // swallow; next tick
  }
}
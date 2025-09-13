/* backend/worker/li_inbox_poller.js */
import { supa } from '../db.js'
import { LinkedInDriver } from '../services/linkedin_driver.js'
import { absorbInbound } from '../services/conversation/ingest.js'

const driver = new LinkedInDriver()
const norm = s => String(s || '').trim().toLowerCase()

async function upsertContactByHandle(handle) {
  const h = norm(handle)
  if (!h) return null
  const found = await supa
    .from('contacts')
    .select('id')
    .eq('platform','linkedin')
    .eq('handle',h)
    .limit(1)
  if (found.data && found.data.length) return found.data[0].id
  const ins = await supa
    .from('contacts')
    .insert({ platform:'linkedin', handle:h, tags:['prospect'] })
    .select('id')
    .maybeSingle()
  return ins?.data?.id || null
}

export async function tickLinkedInInboxPoller() {
  try {
    await driver.init()
    const items = await driver.pollInbox(10)
    for (const m of items) {
      const handle = norm(m.handle)
      if (!handle) continue
      const contactId = await upsertContactByHandle(handle)
      if (!contactId) continue
      await absorbInbound({
        contact_id: contactId,
        platform: 'linkedin',
        text: m.text || '',
        when: new Date(m.ts || Date.now()).toISOString()
      })
      await new Promise(r => setTimeout(r, 600))
    }
  } catch {
    /* ignore; next tick will retry */
  }
}
/* backend/worker/fb_inbox_poller.js */
import { supa } from '../db.js'
import { FacebookDriver } from '../services/facebook_driver.js'
import { absorbInbound } from '../services/conversation/ingest.js'

const driver = new FacebookDriver()

async function upsertContact(username) {
  const h = String(username || '').trim().toLowerCase()
  if (!h) return null

  const found = await supa
    .from('contacts')
    .select('id')
    .eq('platform','facebook')
    .eq('handle',h)
    .limit(1)

  if (found.data && found.data.length) return found.data[0].id

  const ins = await supa
    .from('contacts')
    .insert({ platform: 'facebook', handle: h, tags: ['prospect'] })
    .select('id')
    .maybeSingle()

  return ins?.data?.id || null
}

export async function tickFacebookInboxPoller() {
  try {
    await driver.init()
    const msgs = await driver.pollInbox(8)
    for (const m of msgs) {
      if (!m?.username || !m?.text) continue
      const contactId = await upsertContact(m.username)
      if (!contactId) continue
      await absorbInbound({
        contact_id: contactId,
        platform: 'facebook',
        text: m.text,
        when: new Date(m.ts || Date.now()).toISOString()
      })
      await new Promise(r => setTimeout(r, 400))
    }
  } catch {
    // ignore; next tick tries again
  }
}
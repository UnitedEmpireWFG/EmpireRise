import 'dotenv/config'
import fetch from 'node-fetch'
import { supa } from '../../db.js'
import { jitterMs, typePause } from '../pacing.js'

export async function getIgConnectionForUser(userId) {
  const { data: userRow } = await supa
    .from('app_settings')
    .select('instagram_access_token, meta_access_token, meta_profile')
    .eq('user_id', userId)
    .maybeSingle()

  const { data: configRow } = await supa
    .from('app_config')
    .select('ig_business_id, meta_page_token, meta_access_token')
    .eq('id', 1)
    .maybeSingle()

  const profile = userRow?.meta_profile || {}
  const igBusinessId = profile?.instagram_business_id || configRow?.ig_business_id || null
  const accessToken = userRow?.instagram_access_token
    || userRow?.meta_access_token
    || configRow?.meta_page_token
    || configRow?.meta_access_token
    || process.env.META_PAGE_TOKEN
    || null

  return { igBusinessId, accessToken }
}

export async function sendInstagramDM({ igBusinessId, userId, text, accessToken }) {
  if (!igBusinessId || !userId || !text || !accessToken) throw new Error('ig_send_missing_params')
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(igBusinessId)}/messages?access_token=${encodeURIComponent(accessToken)}`
  const payload = {
    messaging_product: 'instagram',
    recipient: { id: String(userId) },
    message: { text: text.slice(0, 980) }
  }
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.error) throw new Error(j?.error?.message || `ig_send_failed_${r.status}`)
  return j
}

export async function sendInstagramFromQueue({ queueRow, contact, text }) {
  const { igBusinessId, accessToken } = await getIgConnectionForUser(queueRow.user_id)
  if (!igBusinessId || !accessToken) throw new Error('ig_not_connected')
  const igUid = contact?.ig_uid || null
  if (!igUid) throw new Error('missing_recipient_ig_uid')

  // Humanization
  await typePause(text)
  await new Promise(r => setTimeout(r, jitterMs(800, 0.6)))

  return await sendInstagramDM({ igBusinessId, userId: igUid, text, accessToken })
}

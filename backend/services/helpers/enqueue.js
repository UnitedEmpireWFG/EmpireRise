import { supa } from '../../db.js'

export async function upsertContact(platform, handle) {
  const h = String(handle || '').trim().toLowerCase()
  if (!h) return null
  const found = await supa.from('contacts').select('id').eq('platform', platform).eq('handle', h).limit(1)
  if (found.data?.length) return found.data[0].id
  const ins = await supa.from('contacts').insert({ platform, handle: h, tags: ['prospect'] }).select('id').maybeSingle()
  return ins?.data?.id || null
}

export async function enqueueWarmup(platform, handle, user_id=null, campaign='outreach') {
  const contact_id = await upsertContact(platform, handle)
  if (!contact_id) return null
  const ins = await supa.from('queue').insert({
    platform, contact_id, user_id, campaign, status: 'ready', payload: { text: '' }
  }).select('id').maybeSingle()
  return ins?.data?.id || null
}
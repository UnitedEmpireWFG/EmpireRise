import { supaAdmin as supa } from '../db.js'

export async function upsertConnection({ user_id, platform, access_token, refresh_token=null, expires_at=null, scope=null, meta=null }) {
  const row = {
    user_id, platform, access_token,
    refresh_token: refresh_token || null,
    expires_at: expires_at || null,
    scope: scope || null,
    meta: meta ? meta : null
  }
  const { error } = await supa
    .from('connections')
    .upsert(row, { onConflict: 'user_id,platform' })
  if (error) throw error
  return true
}

export async function getConnectionsForUser(user_id) {
  const { data, error } = await supa
    .from('connections')
    .select('platform, access_token, refresh_token, expires_at, scope, meta')
    .eq('user_id', user_id)
  if (error) throw error
  const flags = { facebook:false, instagram:false, linkedin:false }
  for (const r of (data||[])) {
    flags[r.platform] = !!r.access_token
  }
  return flags
}
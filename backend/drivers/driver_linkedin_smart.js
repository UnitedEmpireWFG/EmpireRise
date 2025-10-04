// backend/drivers/driver_linkedin_smart.js
import { supaAdmin } from '../db.js'

export async function saveLinkedInToken({ userId, accessToken, expiresIn = 0, linkedinUserId = null }) {
  if (!userId) throw new Error('saveLinkedInToken_missing_user')
  if (!accessToken) throw new Error('saveLinkedInToken_missing_token')

  const payload = {
    user_id: userId,
    linkedin_access_token: accessToken,
    linkedin_expires_at: expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString() : null,
    linkedin_user_id: linkedinUserId || null,
    updated_at: new Date().toISOString()
  }

  const { error } = await supaAdmin
    .from('app_settings')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) throw new Error('saveLinkedInToken_upsert_failed ' + error.message)

  // ---- NEW: log what we just saved (no secrets)
  console.log('li_token_saved', {
    uid: userId,
    token_len: accessToken?.length || 0,
    has_exp: Boolean(expiresIn),
    has_li_user: Boolean(linkedinUserId)
  })

  return { ok: true }
}

export async function kickoffInitialSync(userId) {
  console.log('li_initial_sync_requested', userId)
}

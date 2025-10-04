// backend/drivers/driver_linkedin_smart.js
import { supaAdmin } from '../db.js'

/**
 * Persist LinkedIn token to app_settings (and bump updated_at).
 * Creates the row if it doesn't exist.
 */
export async function saveLinkedInToken({ userId, accessToken, expiresIn = 0, linkedinUserId = null }) {
  if (!userId) throw new Error('saveLinkedInToken_missing_user')
  if (!accessToken) throw new Error('saveLinkedInToken_missing_token')

  const payload = {
    user_id: userId,
    linkedin_access_token: accessToken,
    linkedin_expires_at: expiresIn
      ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString()
      : null,
    linkedin_user_id: linkedinUserId || null,
    updated_at: new Date().toISOString()
  }

  const { error } = await supaAdmin
    .from('app_settings')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) throw new Error('saveLinkedInToken_upsert_failed ' + error.message)
  return { ok: true }
}

/**
 * (Optional stub) Kick off a first sync after connect.
 * Wire your batch/cron here if you want an immediate pull.
 */
export async function kickoffInitialSync(userId) {
  // no-op stub for now
  console.log('li_initial_sync_requested', userId)
}
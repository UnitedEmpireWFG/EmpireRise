import { sendConnectionRequest } from '../drivers/driver_linkedin_smart.js'

export async function sendLinkedInConnect(job) {
  if (!job) return { ok: false, error: 'missing_job' }
  if ((job.platform || 'linkedin') !== 'linkedin') {
    return { ok: false, error: 'unsupported_platform' }
  }
  if (!job.user_id) {
    return { ok: false, error: 'missing_user' }
  }

  try {
    const result = await sendConnectionRequest({
      userId: job.user_id,
      handle: job.handle,
      profileUrl: job.profile_url,
      note: job.note
    })
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

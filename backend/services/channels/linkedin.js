import { jitterMs, typePause } from '../pacing.js'
import { LinkedInDriver } from '../linkedin_driver.js'
import { getCookieFilePath } from '../../lib/linkedinCookies.js'

export async function sendLinkedInFromQueue({ queueRow, contact, text }) {
  if (!contact?.handle) throw new Error('missing_recipient_handle')
  // Humanization
  await typePause(text)
  await new Promise(r => setTimeout(r, jitterMs(900, 0.6)))

  const cookiesPath = getCookieFilePath(queueRow.user_id)
  const driver = new LinkedInDriver({ cookiesPath })
  try {
    await driver.init()
    return await driver.sendMessageToHandle(contact.handle, text)
  } finally {
    try { await driver.close() } catch {}
  }
}

import path from 'node:path'
import { jitterMs, typePause } from '../pacing.js'
import { LinkedInDriver } from '../linkedin_driver.js'

const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'

export async function sendLinkedInFromQueue({ queueRow, contact, text }) {
  if (!contact?.handle) throw new Error('missing_recipient_handle')
  // Humanization
  await typePause(text)
  await new Promise(r => setTimeout(r, jitterMs(900, 0.6)))

  const cookiesPath = path.join(COOKIES_DIR, `${queueRow.user_id}.json`)
  const driver = new LinkedInDriver({ cookiesPath })
  try {
    await driver.init()
    return await driver.sendMessageToHandle(contact.handle, text)
  } finally {
    try { await driver.close() } catch {}
  }
}

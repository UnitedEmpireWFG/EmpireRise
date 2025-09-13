import { jitterMs, typePause } from '../pacing.js'
// import your real driver deps here

export async function sendFacebookFromQueue({ queueRow, contact, text }) {
  if (!contact?.psid && !contact?.handle) throw new Error('missing_recipient')
  await typePause(text)
  await new Promise(r => setTimeout(r, jitterMs(900, 0.6)))

  // TODO: implement with your driver:
  // await fbDriver.sendMessage({ psid: contact.psid, text })
  return { ok: true, id: `fb_${queueRow.id}` }
}

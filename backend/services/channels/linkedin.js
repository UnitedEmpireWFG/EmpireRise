import { jitterMs, typePause } from '../pacing.js'
// import your real driver deps here

export async function sendLinkedInFromQueue({ queueRow, contact, text }) {
  if (!contact?.handle) throw new Error('missing_recipient_handle')
  // Humanization
  await typePause(text)
  await new Promise(r => setTimeout(r, jitterMs(900, 0.6)))

  // TODO: implement with your driver:
  // await liDriver.sendMessage({ toHandle: contact.handle, text })
  // Simulate success for now:
  return { ok: true, id: `li_${queueRow.id}` }
}

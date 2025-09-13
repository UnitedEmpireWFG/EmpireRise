// backend/services/conversation/ingest.js
import { supa } from "../../db.js"
import { classifySentiment } from "../../lib/ai_policy.js"

function safeText(x) {
  const s = (x == null ? "" : String(x)).trim()
  return s.slice(0, 4000) // guardrails
}

async function upsertThread(contactId, platform) {
  const { data: found } = await supa
    .from("conv_threads")
    .select("id, state, sentiment")
    .eq("contact_id", contactId)
    .eq("platform", platform)
    .limit(1)

  if (found && found.length) return found[0]

  const { data: ins } = await supa
    .from("conv_threads")
    .insert({
      contact_id: contactId,
      platform,
      state: "probe1",
      sentiment: "neutral",
      last_event_at: new Date().toISOString()
    })
    .select("id, state, sentiment")
    .maybeSingle()

  return ins
}

/**
 * Absorb an inbound reply into conversation memory.
 * @param {{contact_id:string, platform:string, text:string, when?:string}} message
 */
export async function absorbInbound(message) {
  const contact_id = message?.contact_id
  const platform   = message?.platform
  const text       = safeText(message?.text)
  const when       = message?.when || new Date().toISOString()

  if (!contact_id || !platform || !text) {
    return { ok: false, error: "missing_fields" }
  }

  const thread = await upsertThread(contact_id, platform)

  // store user message
  await supa.from("conv_messages").insert({
    thread_id: thread.id,
    role: "user",
    text,
    sentiment: classifySentiment(text),
    created_at: when
  })

  // update thread summary
  await supa
    .from("conv_threads")
    .update({
      last_event_at: when,
      sentiment: classifySentiment(text)
    })
    .eq("id", thread.id)

  return { ok: true, thread_id: thread.id }
}

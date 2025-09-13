// backend/services/replies/ingest.js
import { supa } from "../../backend/db.js" // adjust path if your db.js is one level up
import { recordWin } from "../../backend/lib/ab_test.js"
import { classifySentiment } from "../../backend/lib/ai_policy.js"

async function upsertThread(contactId, platform) {
  const { data } = await supa
    .from("conv_threads")
    .select("*")
    .eq("contact_id", contactId)
    .eq("platform", platform)
    .limit(1)

  if (data && data.length) return data[0]

  const { data: ins } = await supa
    .from("conv_threads")
    .insert({ contact_id: contactId, platform, state: "probe1" })
    .select()
    .maybeSingle()

  return ins
}

// Call this when you receive an inbound reply from any platform
export async function onInboundReply({ contact_id, platform, text }) {
  if (!contact_id || !platform || !text) return { ok: false, error: "bad_message" }

  const thread = await upsertThread(contact_id, platform)

  // store user message
  await supa.from("conv_messages").insert({
    thread_id: thread.id,
    role: "user",
    text,
    sentiment: classifySentiment(text)
  })

  await supa.from("conv_threads").update({
    last_event_at: new Date().toISOString(),
    sentiment: classifySentiment(text)
  }).eq("id", thread.id)

  // reward the most recent assistant message in this thread within 48h
  const sinceIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  const { data: lastAssistant } = await supa
    .from("conv_messages")
    .select("id, created_at, features")
    .eq("thread_id", thread.id)
    .eq("role", "assistant")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)

  const msg = lastAssistant && lastAssistant[0]
  if (msg?.features?.ab && Array.isArray(msg.features.ab)) {
    for (const a of msg.features.ab) {
      if (a?.variant_id) await recordWin(a.variant_id)
    }
  }

  return { ok: true, thread_id: thread.id }
}

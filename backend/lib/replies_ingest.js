import { supa } from "../db.js"
import { classifySentiment, advanceState } from "./ai_policy.js"

export async function upsertThread(contactId, platform) {
  if (!contactId || !platform) throw new Error("missing_contact_or_platform")
  const { data, error } = await supa
    .from("conv_threads")
    .select("*")
    .eq("contact_id", contactId)
    .eq("platform", platform)
    .limit(1)
  if (error) throw error
  if (data && data.length) return data[0]
  const ins = await supa
    .from("conv_threads")
    .insert({ contact_id: contactId, platform, state: "probe1" })
    .select()
    .maybeSingle()
  if (ins.error) throw ins.error
  return ins.data
}

export async function addInboundMessage({ contact_id, platform, text }) {
  const thread = await upsertThread(contact_id, platform)
  const sent = classifySentiment(text || "")
  const { error: e1 } = await supa.from("conv_messages").insert({
    thread_id: thread.id,
    role: "user",
    text,
    sentiment: sent
  })
  if (e1) throw e1
  const { error: e2 } = await supa
    .from("conv_threads")
    .update({
      last_event_at: new Date().toISOString(),
      sentiment: sent,
      state: advanceState(thread.state, text || "")
    })
    .eq("id", thread.id)
  if (e2) throw e2
  return { ok: true, thread_id: thread.id, sentiment: sent }
}

export async function addAssistantMessage({ contact_id, platform, text }) {
  const thread = await upsertThread(contact_id, platform)
  await supa.from("conv_messages").insert({
    thread_id: thread.id,
    role: "assistant",
    text,
    sentiment: null
  })
  await supa
    .from("conv_threads")
    .update({ last_event_at: new Date().toISOString() })
    .eq("id", thread.id)
  return { ok: true, thread_id: thread.id }
}

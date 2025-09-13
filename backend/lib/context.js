import { supa } from "../db.js"

export async function buildContext(contact, platform, persona = "client") {
  if (!contact?.id || !platform) throw new Error("missing_inputs")
  const th = await supa
    .from("conv_threads")
    .select("*")
    .eq("contact_id", contact.id)
    .eq("platform", platform)
    .limit(1)
  const thread = th?.data?.[0] || null

  let history = []
  if (thread) {
    const msgs = await supa
      .from("conv_messages")
      .select("role, text")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(8)
    history = Array.isArray(msgs?.data) ? msgs.data : []
  }

  return {
    platform,
    persona,
    state: thread?.state || "intro",
    last_sentiment: thread?.sentiment || "neutral",
    profile: {
      title: contact.title || null,
      company: contact.company || null,
      location: contact.location || null,
      interests: contact.interests || null
    },
    history
  }
}

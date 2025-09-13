import { supa } from "../db.js"
import { buildContext } from "../lib/context.js"
import { generateMessage } from "../lib/ai_gen.js"

export async function startNightlyDraftsCron() {
  // keep your scheduler wiring as is
}

export async function generateNightlyDrafts({ platforms = ["instagram","facebook","linkedin"], limit = 30, persona = "client" } = {}) {
  const contacts = await pickContacts(platforms, limit)    // keep your existing contact selection
  const created = []
  for (const row of contacts) {
    try {
      const ctx = await buildContext(row.contact, row.platform, persona)
      const gen = await generateMessage(ctx)
      if (!gen.ok || !gen.text) continue

      await supa.from("queue").insert({
        platform: row.platform,
        user_id: row.user_id || null,
        contact_id: row.contact.id,
        status: row.platform === "linkedin" ? "ready" : "scheduled",
        payload: { text: gen.text }
      })

      // record assistant message into memory
      const { data: th } = await supa
        .from("conv_threads")
        .select("id")
        .eq("contact_id", row.contact.id)
        .eq("platform", row.platform)
        .limit(1)
      const threadId = th && th[0]?.id
      if (threadId) {
        await supa.from("conv_messages").insert({
          thread_id: threadId,
          role: "assistant",
          text: gen.text
        })
      }

      created.push(row.contact.id)
    } catch {}
  }
  return { ok: true, created: created.length }
}

/*
Stub for pickContacts
Replace with your actual logic if it already exists elsewhere
*/
async function pickContacts(platforms, limit) {
  const out = []
  for (const p of platforms) {
    const r = await supa
      .from("contacts")
      .select("*")
      .eq("platform", p)
      .order("created_at", { ascending: false })
      .limit(Math.ceil(limit / platforms.length))
    const rows = r?.data || []
    for (const c of rows) out.push({ platform: p, contact: c })
  }
  return out
}

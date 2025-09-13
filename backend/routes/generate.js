import express from "express"
import { supa } from "../db.js"
import { generateMessage } from "../lib/ai_gen.js"
import { choosePath, nextState } from "../lib/ai_policy.js"

const router = express.Router()

async function ensureThread(contactId, platform) {
const { data } = await supa
.from("conv_threads").select("*")
.eq("contact_id", contactId).eq("platform", platform).limit(1)

if (data && data.length) return data[0]

const ins = await supa
.from("conv_threads")
.insert({ contact_id: contactId, platform, state: "intro", emotion_score: 0 })
.select().maybeSingle()

return ins?.data || null
}

async function loadHistory(threadId, n = 5) {
const { data } = await supa
.from("conv_messages")
.select("role,text")
.eq("thread_id", threadId)
.order("created_at", { ascending: true })
.limit(n)
return data || []
}

async function buildContext(contact, platform) {
const thread = await ensureThread(contact.id, platform)
const history = thread ? await loadHistory(thread.id, 5) : []

const persona = (thread?.path || choosePath(thread || {}, contact || {})) === "recruit" ? "recruit" : "client"

return {
platform,
persona,
state: thread?.state || "intro",
last_sentiment: thread?.sentiment || "neutral",
profile: {
title: contact.title || "",
company: contact.company || "",
location: contact.location || "",
interests: contact.interests || ""
},
history
}
}

async function writeAssistantDraft(threadId, text, sentiment) {
await supa.from("conv_messages").insert({
thread_id: threadId,
role: "assistant",
text,
sentiment,
status: "draft"
})
}

router.post("/drafts/create", async (req, res) => {
try {
const platform = String(req.body?.platform || "linkedin").toLowerCase()
const limit = Number(req.body?.limit || 5)

const { data: contacts } = await supa
  .from("contacts")
  .select("id,name,title,company,location,interests,platform,tags")
  .in("platform", [platform, null])
  .limit(limit)

const drafts = []

for (const contact of contacts || []) {
  const ctx = await buildContext(contact, platform)
  const gen = await generateMessage(ctx)

  if (!gen?.text) continue

  const thread = await ensureThread(contact.id, platform)
  if (!thread?.id) continue

  await writeAssistantDraft(thread.id, gen.text, gen.sentiment || "neutral")

  drafts.push({
    contact_id: contact.id,
    platform,
    thread_id: thread.id,
    text: gen.text,
    sentiment: gen.sentiment || "neutral"
  })
}

res.json({ ok: true, inserted: drafts.length, drafts })


} catch (e) {
res.status(200).json({ ok: false, error: String(e.message || e) })
}
})

export default router

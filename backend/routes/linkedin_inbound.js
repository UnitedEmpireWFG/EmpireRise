// File: backend/routes/meta_webhooks.js
import express from "express"
import crypto from "crypto"
import { supa } from "../db.js"
import { absorbInbound } from "../lib/state.js"

const router = express.Router()

router.get("/", (req, res) => {
const mode = req.query["hub.mode"]
const token = req.query["hub.verify_token"]
const challenge = req.query["hub.challenge"]
if (mode === "subscribe" && token && challenge) {
return res.status(200).send(challenge)
}
res.status(200).json({ ok: true })
})

async function seenMessage(id) {
const { data } = await supa.from("inbound_dedup").select("id").eq("id", id).limit(1)
return !!(data && data.length)
}

async function markSeen(id) {
await supa.from("inbound_dedup").insert({ id })
}

router.post("/", async (req, res) => {
try {
const body = req.body || {}
const entries = body.entry || []

for (const entry of entries) {
  const messaging = entry.messaging || []
  for (const m of messaging) {
    const text = m.message?.text || ""
    const senderPsid = m.sender?.id || null
    const pageId = m.recipient?.id || null
    const ts = m.timestamp || Date.now()
    if (!senderPsid || !text) continue

    const dedupId = crypto.createHash("sha1").update(`${senderPsid}|${ts}|${text}`).digest("hex")
    if (await seenMessage(dedupId)) continue

    let contactId = null
    const existing = await supa
      .from("contacts")
      .select("id")
      .eq("psid", senderPsid)
      .limit(1)

    if (existing.data && existing.data.length) {
      contactId = existing.data[0].id
    } else {
      const ins = await supa
        .from("contacts")
        .insert({
          psid: senderPsid,
          platform: "facebook",
          page_id: pageId || null
        })
        .select("id")
        .maybeSingle()
      contactId = ins?.data?.id || null
    }

    if (contactId) {
      await absorbInbound({
        contact_id: contactId,
        platform: "facebook",
        text
      })
      await markSeen(dedupId)
    }
  }
}

res.json({ ok: true })


} catch (e) {
res.status(200).json({ ok: false, error: e.message })
}
})

export default router

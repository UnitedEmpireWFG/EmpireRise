import express from "express"
import crypto from "crypto"
import { supa } from "../db.js"
import { absorbInbound } from "../lib/state.js"

const router = express.Router()

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"]
  const token = req.query["hub.verify_token"]
  const challenge = req.query["hub.challenge"]
  if (mode === "subscribe" && token && challenge) return res.status(200).send(challenge)
  res.status(200).json({ ok: true })
})

async function seenMessage(id) {
  const { data } = await supa.from("inbound_dedup").select("id").eq("id", id).limit(1)
  return !!(data && data.length)
}
async function markSeen(id) { await supa.from("inbound_dedup").insert({ id }) }

router.post("/", async (req, res) => {
  try {
    const body = req.body || {}
    const entries = body.entry || []

    for (const entry of entries) {
      const changes = entry.changes || []
      for (const ch of changes) {
        const value = ch.value || {}
        const mp = value?.messaging_product
        if (mp !== 'instagram' && mp !== 'facebook') continue

        const msgs = value?.messages || []
        for (const m of msgs) {
          const text = m.text?.body || m.message?.text || ""
          const from = m.from || m.sender?.id
          const ts   = Number(m.timestamp || Date.now())
          if (!from || !text) continue

          const dedupId = crypto.createHash("sha1").update(`${mp}|${from}|${ts}|${text}`).digest("hex")
          if (await seenMessage(dedupId)) continue

          let contactId = null
          if (mp === 'instagram') {
            const found = await supa.from('contacts').select('id').eq('platform','instagram').eq('ig_uid', String(from)).limit(1)
            if (found.data?.length) contactId = found.data[0].id
            else {
              const ins = await supa.from('contacts').insert({ platform:'instagram', ig_uid: String(from), tags:['prospect'] }).select('id').maybeSingle()
              contactId = ins?.data?.id || null
            }
          } else {
            const found = await supa.from('contacts').select('id').eq('psid', String(from)).limit(1)
            if (found.data?.length) contactId = found.data[0].id
            else {
              const ins = await supa.from('contacts').insert({ platform:'facebook', psid:String(from), tags:['prospect'] }).select('id').maybeSingle()
              contactId = ins?.data?.id || null
            }
          }

          if (contactId) {
            await absorbInbound({
              contact_id: contactId,
              platform: mp,
              text,
              when: new Date(ts || Date.now()).toISOString()
            })
            await markSeen(dedupId)
          }
        }
      }
    }

    res.json({ ok: true })
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || 'meta_webhook_failed' })
  }
})

export default router

// backend/routes/offers.js
import { Router } from "express"
import { proposeClientSlots, bookClientSlot, registerWebinar } from "../lib/offers.js"

const r = Router()

r.post("/schedule/1on1/propose", async (req, res) => {
  const { contact_id } = req.body || {}
  const out = await proposeClientSlots({ contact_id })
  res.json(out)
})
r.post("/schedule/1on1/book", async (req, res) => {
  const { contact_id, slot_id, in_person } = req.body || {}
  const out = await bookClientSlot({ contact_id, slot_id, in_person })
  res.json(out)
})
r.post("/schedule/webinar/register", async (req, res) => {
  const { contact_id, code } = req.body || {}
  const out = await registerWebinar({ contact_id, code })
  res.json(out)
})

export default r

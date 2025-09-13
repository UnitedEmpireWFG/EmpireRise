app.post("/webhooks/calendly/webhook", express.json(), async (req, res) => {
  try {
    const email = req.body?.payload?.invitee?.email
    if (!email) return res.status(400).json({ ok: false, error: "no email" })
    const { data: found } = await sb.from("contacts").select("id").eq("email", email).limit(1)
    if (!found?.length) return res.json({ ok: true, note: "no matching contact" })
    await sb.from("contacts").update({ stage: "booked" }).eq("id", found[0].id)
    await sb.from("logs").insert({ user_id: "default", contact_id: found[0].id, kind: "booked", platform: "calendly" })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

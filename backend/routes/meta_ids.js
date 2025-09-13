import express from "express"
import fetch from "node-fetch"
import { supabase } from "../lib/supabase.js"

const router = express.Router()

async function getMetaToken() {
  const { data } = await supabase
    .from("credentials")
    .select("*")
    .eq("provider", "meta_user")
    .order("created_at", { ascending: false })
    .limit(1)
  return data && data[0] && data[0].access_token
}

router.get("/page-list", async (req, res) => {
  const token = await getMetaToken()
  if (!token) return res.status(400).json({ error: "No Meta token. Connect first." })
  const r = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${token}`)
  const t = await r.text()
  res.status(r.status).send(t)
})

router.get("/ig-id/:pageId", async (req, res) => {
  const token = await getMetaToken()
  if (!token) return res.status(400).json({ error: "No Meta token. Connect first." })
  const r = await fetch(`https://graph.facebook.com/v19.0/${req.params.pageId}?fields=instagram_business_account&access_token=${token}`)
  const t = await r.text()
  res.status(r.status).send(t)
})

export default router

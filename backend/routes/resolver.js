import { Router } from "express"
import db from "../utils/db.js"

async function resolveProfiles({ name, hints = {} }) {
  const out = {}
  if (hints?.linkedin) out.linkedin = hints.linkedin
  if (hints?.instagram) out.instagram = hints.instagram
  if (hints?.facebook) out.facebook = hints.facebook
  return out
}

const router = Router()

router.post("/api/resolver/profiles", async (req, res) => {
  try {
    const userId = req.user?.id || req.body.user_id
    if (!userId) return res.status(400).json({ ok: false, error: "missing user_id" })
    const { name, hints, seed, create_prospect } = req.body || {}
    const urls = { ...(seed || {}), ...(await resolveProfiles({ name, hints })) }

    if (create_prospect) {
      const { rows } = await db.query(
        `INSERT INTO prospects (user_id, name, platform, profile_urls, discovered_via, status)
         VALUES ($1,$2,$3,$4,$5,'new') RETURNING *`,
        [userId, name, "resolver", urls, "resolver"]
      )
      return res.json({ urls, prospect: rows[0] })
    }

    res.json({ urls })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
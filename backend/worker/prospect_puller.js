import db from '../utils/db.js'
import { fetchProspects } from '../drivers/driver_linkedin_smart.js'

const MAX_PER_TICK = Number(process.env.PROSPECT_PULL_MAX || 25)

export async function runProspectPull(userId) {
  const prospects = await fetchProspects({ userId, limit: MAX_PER_TICK })
  if (!Array.isArray(prospects) || prospects.length === 0) {
    console.log('prospect_puller: none fetched', { userId })
    return { inserted: 0 }
  }

  let inserted = 0
  for (const p of prospects) {
    try {
      const q = `
        insert into prospects (user_id, source, li_profile_id, full_name, headline, company, location, url, meta, status)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new')
        on conflict (user_id, li_profile_id)
        do update set
          full_name = coalesce(EXCLUDED.full_name, prospects.full_name),
          headline = coalesce(EXCLUDED.headline, prospects.headline),
          company = coalesce(EXCLUDED.company, prospects.company),
          location = coalesce(EXCLUDED.location, prospects.location),
          url = coalesce(EXCLUDED.url, prospects.url),
          meta = prospects.meta || EXCLUDED.meta,
          updated_at = now()
        returning id
      `
      const vals = [
        userId,
        p.source || 'linkedin',
        p.li_profile_id || null,
        p.full_name || null,
        p.headline || null,
        p.company || null,
        p.location || null,
        p.url || null,
        p.meta || {}
      ]
      await db.query(q, vals)
      inserted++
    } catch (e) {
      // don’t crash loop
      console.log('prospect_puller_insert_error', e.message)
    }
  }
  console.log('prospect_puller: inserted', { userId, inserted })
  return { inserted }
}

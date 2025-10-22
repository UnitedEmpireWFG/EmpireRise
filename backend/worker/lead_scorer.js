import db from '../utils/db.js'

function scoreProspect(p) {
  let score = 0
  const loc = (p.location || '').toLowerCase()
  const headline = (p.headline || '').toLowerCase()
  const company = (p.company || '').toLowerCase()

  // Example signals — tweak to your GTM
  if (loc.includes('alberta') || loc.includes('edmonton') || loc.includes('calgary')) score += 20
  if (headline.includes('owner') || headline.includes('founder') || headline.includes('ceo')) score += 30
  if (headline.includes('manager') || headline.includes('director')) score += 15
  if (company && company.length > 0) score += 5

  // cap
  if (score > 100) score = 100
  return score
}

export async function runLeadScoring(userId, { batch = 50 } = {}) {
  const { rows: prospects } = await db.query(
    `select * from prospects
     where user_id=$1 and status in ('new','scored') 
     order by updated_at asc
     limit $2`,
    [userId, batch]
  )

  if (prospects.length === 0) {
    console.log('lead_scorer: nothing to score', { userId })
    return { scored: 0 }
  }

  let scored = 0
  for (const p of prospects) {
    try {
      const score = scoreProspect(p)
      // upsert into leads
      await db.query(
        `insert into leads (user_id, full_name, company, title, location, source, li_profile_id, lead_score, created_at)
         values ($1,$2,$3,$4,$5,'linkedin',$6,$7, now())
         on conflict (user_id, li_profile_id)
         do update set
           full_name = coalesce(EXCLUDED.full_name, leads.full_name),
           company = coalesce(EXCLUDED.company, leads.company),
           title = coalesce(EXCLUDED.title, leads.title),
           location = coalesce(EXCLUDED.location, leads.location),
           lead_score = GREATEST(leads.lead_score, EXCLUDED.lead_score)`,
        [
          userId,
          p.full_name || null,
          p.company || null,
          p.headline || null,
          p.location || null,
          p.li_profile_id || null,
          score
        ]
      )
      await db.query(`update prospects set status='scored', updated_at=now() where id=$1`, [p.id])
      scored++
    } catch (e) {
      console.log('lead_scorer_error', e.message)
    }
  }
  console.log('lead_scorer: scored', { userId, scored })
  return { scored }
}

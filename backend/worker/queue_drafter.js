import db from '../utils/db.js'
import { timePolicy } from '../services/time_windows.js'

const DAILY_CAP = Number(process.env.DAILY_OUTBOUND_CAP || 40)
const MIN_SCORE = Number(process.env.MIN_SCORE_TO_MESSAGE || 40)

function makeFirstTouch(fullName) {
  // Keep it tame — adjust copy to your voice later
  const first = fullName ? fullName.split(' ')[0] : null
  const name = first ? `${first}` : 'there'
  return `Hey ${name} — appreciate the work you’re doing. I share growth ideas for local owners. Open to a quick intro?`
}

export async function runQueueDrafts(userId) {
  // respect working hours unless override flags allow
  if (!timePolicy.isAllowedNow('allowDraftOutside')) {
    console.log('queue_drafter: outside draft window')
    return { drafted: 0 }
  }

  // how many already scheduled today?
  const { rows: [{ cnt }] } = await db.query(
    `select count(*)::int as cnt
     from queue
     where user_id=$1
       and status in ('scheduled','pending')
       and created_at::date = now()::date`,
    [userId]
  )
  const room = Math.max(0, DAILY_CAP - (cnt || 0))
  if (room === 0) {
    console.log('queue_drafter: at cap', { userId, DAILY_CAP })
    return { drafted: 0 }
  }

  const { rows: leads } = await db.query(
    `select l.*
     from leads l
     left join queue q on q.user_id=l.user_id and q.li_profile_id=l.li_profile_id
     where l.user_id=$1
       and l.lead_score >= $2
       and q.id is null
     order by l.lead_score desc, l.created_at asc
     limit $3`,
    [userId, MIN_SCORE, room]
  )
  if (leads.length === 0) {
    console.log('queue_drafter: nothing eligible', { userId })
    return { drafted: 0 }
  }

  let drafted = 0
  for (const L of leads) {
    try {
      await db.query(
        `insert into queue (user_id, provider, li_profile_id, to_name, message, status, created_at)
         values ($1,'linkedin',$2,$3,$4,'scheduled', now())`,
        [userId, L.li_profile_id || null, L.full_name || null, makeFirstTouch(L.full_name)]
      )
      drafted++
    } catch (e) {
      console.log('queue_drafter_insert_error', e.message)
    }
  }
  console.log('queue_drafter: drafted', { userId, drafted })
  return { drafted }
}

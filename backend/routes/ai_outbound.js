// backend/routes/ai_outbound.js
import express from 'express'
import { aiComplete } from '../lib/ai.js'
import db from '../utils/db.js'

const router = express.Router()

/** ---------- helpers ---------- **/

function trim(s){ return (s||'').toString().replace(/\s+/g,' ').trim() }
const MAX_DM = 500

// system brief you can tune
function authorBrief(user) {
  return trim(`
You are ${user?.name || 'a financial professional'} at ${user?.company || 'EmpireRise'} in ${user?.region || 'Canada'}.
You help ${user?.icp || 'busy professionals & families'} with ${user?.value || 'clear financial gameplans, protecting income, and long-term wealth building'}.
Tone: warm, concise, credible, never pushy. Avoid emojis/links. One soft CTA.
`)
}

// value props & probing per GOAL
const GOALS = {
  career: {
    opener: `I noticed your role and background—curious how your current path lines up with where you want to be financially and lifestyle-wise.`,
    probes: [
      `What’s the #1 thing you want more of from work—time, income growth, or flexibility?`,
      `If you could adjust one knob this quarter, which would you pick: schedule, earnings upside, or impact?`
    ],
    cta: `If helpful, I can share two quick options that fit around your schedule—open to a 10–15 min compare?`
  },
  client: {
    opener: `I help professionals set a clean plan around income protection and long-term wealth, without adding complexity.`,
    probes: [
      `Do you already have a simple plan for emergencies + long-term investing that you feel good about?`,
      `What’s one area that feels fuzzy right now—cash flow balance, risk coverage, or investing cadence?`
    ],
    cta: `Happy to map next steps in 10–15 min—want me to send 2 times that work this week?`
  },
  referral: {
    opener: `I’m building a small circle of local pros we can swap value with (intros, insights, co-hosted events).`,
    probes: [
      `Are you open to light collaboration if it’s clearly win-win and low lift?`,
      `Who tends to benefit most from working with you? (Gives me context for intros.)`
    ],
    cta: `Open to a quick 10-min intro? I can share 2 slot options.`
  }
}

// pick first available goal, then fall back
function pickGoal(goal, fallbacks=[]) {
  const seq = [goal, ...fallbacks].filter(Boolean)
  for (const g of seq) if (GOALS[g]) return g
  return 'client'
}

// simple seniority/fit bumpers
function heuristicScore(p) {
  let s = 50
  const title = (p.title||p.headline||'').toLowerCase()
  if (title.includes('manager')||title.includes('director')) s += 10
  if (title.includes('owner')||title.includes('founder')||title.includes('principal')) s += 15
  if ((p.region||'').match(/(ab|alberta|edmonton|calgary|canada)/i)) s += 8
  if ((p.company||'').match(/(aon|wfg|insurance|finance|bank|account)/i)) s += 6
  s = Math.max(0, Math.min(100, s))
  return s
}

// build layered first-touch with probing + soft CTA (+ optional Calendly windows)
function buildIntro({ author, prospect, goal, probes, slots=[] }) {
  const g = GOALS[goal] || GOALS.client
  const name = prospect.first_name || prospect.name?.split(' ')[0] || prospect.name || ''
  const pieces = []

  pieces.push(`Hey ${name || ''}${name?', ':''}${g.opener}`)
  // one probing + one layering probe
  if (probes?.length) {
    pieces.push(probes[0])
    if (probes[1]) pieces.push(probes[1])
  } else {
    pieces.push(g.probes[0])
    pieces.push(g.probes[1])
  }

  let cta = g.cta
  if (slots.length) {
    // e.g., “I can do Tue 2:30p or Thu 10:00a MT—either work?”
    const pretty = slots.slice(0,2).map(s => s.human).join(' or ')
    cta = `If it helps, I can do ${pretty} — either work?`
  }
  pieces.push(cta)

  let msg = pieces.join(' ')
  if (msg.length > MAX_DM) msg = msg.slice(0, MAX_DM-1)
  return msg
}

/** ---------- Calendly fetch ---------- **/

async function getSuggestedSlots(userId, days=7, count=2) {
  try {
    const url = new URL('/api/cal/suggest', process.env.APP_API_ORIGIN || 'http://localhost:8787')
    url.searchParams.set('days', String(days))
    url.searchParams.set('slots', String(count))
    // we read directly from DB: the /api/cal/suggest route is already mounted; prefer DB path:
    const { rows } = await db.query(
      `select start_at, end_at, tz from cal_suggest_next($1, $2) limit $3`,
      [userId, days, count]
    )
    return (rows||[]).map(r => ({
      start: r.start_at, end: r.end_at, tz: r.tz,
      human: new Date(r.start_at).toLocaleString('en-CA', { dateStyle:'medium', timeStyle:'short' })
    }))
  } catch { return [] }
}

/** ---------- API: score prospects ---------- **/

router.get('/score-prospects', async (req, res) => {
  try {
    const userId = req.user?.id
    const limit = Math.min(200, Number(req.query.limit || 50))

    const { rows: prospects } = await db.query(
      `select id, user_id, name, first_name, headline as title, company, region, li_profile_url
       from prospects where user_id=$1 order by created_at desc limit $2`, [userId, limit]
    )

    const updates = []
    for (const p of prospects) {
      const score = heuristicScore(p)
      const note = score >= 70 ? 'Strong fit based on title/region/company.' :
                   score >= 60 ? 'Good fit; watch for timing.' :
                                 'Light fit; keep warm.'
      updates.push(db.query(`update prospects set score=$1, note=$2 where id=$3`, [score, note, p.id]))
      // ensure a lead row
      updates.push(db.query(
        `insert into leads (user_id, prospect_id, stage, confidence)
         values ($1,$2,$3,$4)
         on conflict (user_id, prospect_id) do update set confidence=excluded.confidence`,
        [userId, p.id, 'scored', score/100.0]
      ))
    }
    await Promise.all(updates)
    res.json({ ok:true, updated:prospects.length })
  } catch (e) {
    res.status(200).json({ ok:false, error:e.message })
  }
})

/** ---------- API: draft intros with goal + fallbacks + probing + Calendly ---------- **/

router.post('/draft-intros', async (req, res) => {
  try {
    const userId = req.user?.id
    const {
      min_score = 65,
      goal = 'client',
      fallbacks = ['career','referral'],   // will try goal, then these
      limit = 25,
      include_slots = true
    } = (req.body || {})

    const { rows: meRows } = await db.query(
      `select name, company, region, icp, value from user_brief where user_id=$1 limit 1`, [userId]
    )
    const brief = authorBrief(meRows?.[0] || {})

    const { rows: picks } = await db.query(
      `select id, name, first_name, headline as title, company, region, score
       from prospects where user_id=$1 and coalesce(score,0) >= $2
       order by score desc, created_at desc limit $3`,
       [userId, min_score, Math.min(200, Number(limit||25))]
    )

    const slots = include_slots ? await getSuggestedSlots(userId, 7, 2) : []

    let drafted = 0
    for (const p of picks) {
      const g = pickGoal(goal, fallbacks)
      const msg = buildIntro({ author:meRows?.[0], prospect:p, goal:g, probes:GOALS[g].probes, slots })

      // Optional light “brain pass” for language polish
      const final = await aiComplete(`
${brief}
Prospect: ${p.name||''} — ${p.title||''} at ${p.company||''} in ${p.region||''}.
Write a natural LinkedIn first message using this draft exactly as the scaffold:
---
${msg}
---
Keep it under ${MAX_DM} characters, same intent and CTA. No links, no emojis.
`)

      // store in queue as a draft
      await db.query(
        `insert into queue (user_id, prospect_id, channel, body, status)
         values ($1,$2,'linkedin_dm', $3, 'draft')
         on conflict do nothing`,
        [userId, p.id, trim(final || msg)]
      )

      // mark lead stage -> drafted
      await db.query(
        `update leads set stage='drafted' where user_id=$1 and prospect_id=$2`,
        [userId, p.id]
      )

      drafted++
    }

    res.json({ ok:true, drafted })
  } catch (e) {
    res.status(200).json({ ok:false, error:e.message })
  }
})

export default router
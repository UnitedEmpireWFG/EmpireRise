// backend/routes/ai_ops.js
import express from 'express'
import db from '../utils/db.js'
import { scoreProspect } from '../services/ai/scorer.js'
import { genIntroDM } from '../services/ai/message_gen.js'

const router = express.Router()

/* Ensure helper columns exist (idempotent) */
async function ensureCols() {
  await db.query(`
    alter table public.prospects
      add column if not exists note text;
  `)
}

/**
 * GET /api/ai/score-prospects?limit=20
 * Scores up to N unscored prospects for the current user, writes score + note,
 * and ensures/creates a matching lead row with stage='scored' and confidence=score/100.
 */
router.get('/score-prospects', async (req, res) => {
  try {
    await ensureCols()
    const userId = req.user?.id || req.user?.sub
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)))

    // fetch unscored
    const { rows: prospects } = await db.query(
      `select * from public.prospects
       where user_id=$1 and (score is null or score=0)
       order by created_at asc
       limit $2`,
      [userId, limit]
    )
    if (prospects.length === 0) return res.json({ ok:true, scored:0, updated:0, leads_created:0 })

    // basic user hint (you can later fetch from app_settings)
    const userHint = {
      industry: 'financial services',
      ideal_customer: 'Canada residents interested in better financial planning',
      region_focus: 'Alberta / Edmonton'
    }

    let scored = 0, updated = 0, leadsCreated = 0
    for (const pr of prospects) {
      const { score, why, tags } = await scoreProspect(pr, userHint)

      const { rowCount } = await db.query(
        `update public.prospects
           set score=$1, note=$2, updated_at=now()
         where id=$3 and user_id=$4`,
        [score, why || null, pr.id, userId]
      )
      updated += rowCount > 0 ? 1 : 0
      scored++

      // ensure a lead exists for this prospect
      await db.query(
        `insert into public.leads (user_id, prospect_id, stage, confidence)
         values ($1,$2,'scored',$3)
         on conflict (id) do nothing`,
        [userId, pr.id, score / 100]
      ).catch(()=>{}) // tolerate if a lead already exists via other flows

      // upsert by (user_id,prospect_id) if you later add a uniqueness constraint
      const { rows: maybeLead } = await db.query(
        `select id from public.leads where user_id=$1 and prospect_id=$2 limit 1`,
        [userId, pr.id]
      )
      if (maybeLead.length === 0) leadsCreated++
    }

    res.json({ ok:true, scored, updated, leads_created:leadsCreated })
  } catch (e) {
    res.status(200).json({ ok:false, error:e.message })
  }
})

/**
 * POST /api/ai/draft-intros
 * Body: { min_score?: number, limit?: number }
 * Generates intro DMs for top leads (prospects with score >= min_score).
 * Returns drafts and (optionally) inserts to your queue table if it exists.
 */
router.post('/draft-intros', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub
    const minScore = Math.max(0, Math.min(100, Number(req.body?.min_score ?? 60)))
    const limit = Math.min(50, Math.max(1, Number(req.body?.limit ?? 10)))

    const { rows: prospects } = await db.query(
      `select p.*
         from public.prospects p
        where p.user_id=$1 and coalesce(p.score,0) >= $2
        order by p.score desc, p.updated_at desc
        limit $3`,
      [userId, minScore, limit]
    )

    // you can replace this with a pull from app_settings later
    const userProfile = {
      name: req.user?.email?.split('@')[0] || 'Bassem',
      role: 'Advisor',
      company: 'EmpireRise',
      region: 'Edmonton, AB',
      value_prop: 'simple, judgment-free planning that helps households keep more of what they earn'
    }

    const drafts = []
    for (const p of prospects) {
      const { text, variant, meta } = await genIntroDM({ prospect: p, userProfile, style: 'friendly' })
      drafts.push({ prospect_id: p.id, to: p.full_name, text, variant, meta })

      // If you already have a queue table, do a best-effort insert
      await db.query(`
        do $$
        begin
          if exists (select 1 from information_schema.tables where table_schema='public' and table_name='queue') then
            insert into public.queue (user_id, channel, payload, status, created_at)
            values ($1, 'linkedin_dm', jsonb_build_object('prospect_id',$2,'text',$3), 'draft', now());
          end if;
        end$$;
      `, [userId, p.id, text]).catch(()=>{})
    }

    res.json({ ok:true, count: drafts.length, drafts })
  } catch (e) {
    res.status(200).json({ ok:false, error:e.message })
  }
})

export default router
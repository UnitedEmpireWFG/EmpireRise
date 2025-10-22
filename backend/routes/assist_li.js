// backend/routes/assist_li.js
import { Router } from 'express'
import { generateDraft } from '../lib/ai_drafts.js'
import { supa } from '../db.js'
import { timePolicy } from '../services/time_windows.js'

const router = Router()

async function getUserProfile(userId) {
  const { data } = await supa
    .from('profiles')
    .select('id, first_name, company, calendly_url, persona')
    .eq('id', userId)
    .single()
  return data || { id: userId }
}

router.post('/draft', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub
    if (!userId) return res.status(401).json({ ok:false, error:'unauthorized' })

    const user = await getUserProfile(userId)
    const person = req.body?.person || {}   // { full_name, role, company, region, topic, intent_hint }
    const thread = req.body?.thread || {}   // { last_inbound, last_outbound, summary }
    const settings = {
      tone: req.body?.tone || 'warm, concise, and human',
      goal: req.body?.goal || 'qualify and move toward a concrete next step',
      operating_hours: timePolicy._cfg
    }

    const draft = await generateDraft({ user, person, thread, settings })
    return res.json({ ok:true, draft })
  } catch (e) {
    console.log('assist_li_draft_error', e?.message)
    return res.status(200).json({ ok:false, error: e?.message || 'draft_error' })
  }
})

export default router
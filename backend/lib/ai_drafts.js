// backend/lib/ai_drafts.js
import { aiComplete } from '../lib/ai.js'

/**
 * Inputs
 *  - user: { id, first_name?, company?, persona?, calendly_url? }
 *  - person: { full_name, role?, company?, region?, topic?, last_touch?, intent_hint? }
 *  - thread: { last_inbound?, last_outbound?, summary? }
 *  - settings: { tone?, goal?, operating_hours? }
 *
 * Behavior
 *  - Chooses primary intent (career/client/partner/warm_intro/other) with fallback routing.
 *  - Builds layered probing: 1 probing Q + 2 follow-ups that “ladder” context/emotion.
 *  - If Calendly link present, proposes 2 concrete windows aligned to work window policy.
 *  - Produces 3 variants (short opener, standard, longer follow-up) with the same intent.
 */
export async function generateDraft({ user = {}, person = {}, thread = {}, settings = {} }) {
  const calendars = suggestTimeWindows(settings?.operating_hours, user?.calendly_url)

  // Intent heuristic from thread & hint
  const hinted = (person?.intent_hint || '').toLowerCase()
  let primaryIntent =
    hinted.includes('career') ? 'career' :
    hinted.includes('client') ? 'client' :
    hinted.includes('partner') ? 'partner' : null

  // very lightweight inference from last inbound
  const lastInbound = (thread?.last_inbound || '').toLowerCase()
  if (!primaryIntent) {
    if (/hiring|role|resume|cv|opportunit/.test(lastInbound)) primaryIntent = 'career'
    else if (/budget|project|service|client|need|trial|demo/.test(lastInbound)) primaryIntent = 'client'
    else if (/collab|partner|co-?market/.test(lastInbound)) primaryIntent = 'partner'
    else primaryIntent = 'client' // default to pipeline creation
  }

  const fallbackIntent = primaryIntent === 'career' ? 'client' : 'career'

  const tone = settings?.tone || 'warm, concise, and human'
  const goal = settings?.goal || 'qualify and move toward a concrete next step'
  const persona = user?.persona || 'operator/founder who respects time and adds value quickly'
  const sender = sanitizeName(user?.first_name || 'I')
  const company = user?.company || 'our team'
  const calUrl = user?.calendly_url || ''

  const name = person?.full_name || 'there'
  const role = person?.role || ''
  const theirCo = person?.company || ''
  const topic = person?.topic || ''
  const region = person?.region || ''

  const contextSummary = thread?.summary || summarizeContext(lastInbound, thread?.last_outbound)

  const sys = [
    `You are a ${persona}.`,
    `Goal: ${goal}.`,
    `Tone: ${tone}.`,
    `Always stay compliant, avoid hard salesy tone, and write like a real person.`,
    `Use British/Canadian spelling only if the user's region suggests it (${region || 'unknown region'}).`,
  ].join('\n')

  const userPrompt = `
Prospect:
- Name: ${name}
- Role/Company: ${role || '—'} @ ${theirCo || '—'}
- Region: ${region || '—'}
- Topic: ${topic || '—'}

Thread context (last inbound/outbound and summary):
${contextSummary || '—'}

Primary intent to pursue: ${primaryIntent}
Fallback intent if disinterest signalled: ${fallbackIntent}

Calendly link: ${calUrl ? calUrl : 'none'}
If a link exists, propose two concrete windows that align with typical 9–5 working hours in their region, mention the link, and keep it easy to say yes.

Create three drafts:
1) SHORT OPENER (<=240 chars) — quick hook, 1 probing question.
2) STANDARD DM (~2–4 sentences) — hook + single probing Q + 1 layered follow-up that pulls a bit of emotion or business stake.
3) FOLLOW-UP DM (if they ghost) — acknowledge, soften, offer an alternative, and include a Calendly nudge if available.

Rules:
- If prospect signals “not into career”, pivot to CLIENT value prop in the same draft (not a 2nd message).
- Be specific: tie value prop to their role/company/topic when possible.
- Never overpromise. Avoid hard CTAs; gentle “open to exploring?” is fine.
- If proposing time, give two options (e.g., “Tue 10–12 or Thu 2–4 ET”) AND include the link if provided.
- Keep placeholders out. Output clean, send-ready copy.

Return JSON with:
{
  "intent": "<career|client|partner|other>",
  "fallback": "<career|client|partner|other>",
  "cal_proposal": "<string or empty>",
  "variants": {
     "short": "<text>",
     "standard": "<text>",
     "followup": "<text>"
  }
}
`

  const raw = await aiComplete(JSON.stringify({ system: sys, user: userPrompt }))
  const parsed = safeParseJSON(raw)

  // If model didn’t return valid JSON, build a minimal, safe set
  if (!parsed?.variants) {
    const base = basicFallback({ sender, company, name, primaryIntent, fallbackIntent, calUrl, calendars })
    return base
  }

  // If no calendly text but we do have a link, augment the cal_proposal
  if (calUrl && !parsed.cal_proposal) {
    parsed.cal_proposal = defaultCalLine(calUrl, calendars)
  }
  return {
    intent: parsed.intent || primaryIntent,
    fallback: parsed.fallback || fallbackIntent,
    cal_proposal: parsed.cal_proposal || '',
    variants: parsed.variants
  }
}

/* ---------------- helpers ---------------- */

function sanitizeName(n) { return String(n).replace(/[^\p{L}\p{N}\s\-']/gu, '').trim() }

function summarizeContext(inbound, outbound) {
  const a = inbound ? `Last inbound: ${inbound}` : ''
  const b = outbound ? ` | Last outbound: ${outbound}` : ''
  return (a + b) || ''
}

function defaultCalLine(url, windows) {
  if (!url) return ''
  const w = windows?.length ? ` (${windows.join(' or ')})` : ''
  return `If it helps, here’s a quick link to pick a time${w}: ${url}`
}

// naive time windows aligned to 9–5 (local-ish)
function suggestTimeWindows(operating, url) {
  // ignore url content; just return two sane windows
  const base = ['Tue 10–12', 'Thu 2–4']
  if (!operating) return base
  try {
    const days = operating?.days?.length ? operating.days : [1,2,3,4,5]
    const start = operating?.start || '09:00'
    const end = operating?.end || '17:00'
    // choose two mid-range blocks
    const pick = []
    if (days.includes(2)) pick.push('Tue 10–12')
    if (days.includes(4)) pick.push('Thu 2–4')
    return pick.length ? pick : base
  } catch { return base }
}

function safeParseJSON(s) {
  try {
    const j = typeof s === 'string' ? JSON.parse(s) : s
    // handle cases where the model responded with a code-block wrapper
    if (j && typeof j === 'object') return j
    if (typeof s === 'string') {
      const m = s.match(/\{[\s\S]*\}$/)
      if (m) return JSON.parse(m[0])
    }
  } catch {}
  return null
}

function basicFallback({ sender, company, name, primaryIntent, fallbackIntent, calUrl, calendars }) {
  const calLine = calUrl ? defaultCalLine(calUrl, calendars) : ''
  const hook = primaryIntent === 'career'
    ? `Saw your background—curious what you'd want next so I don't pitch something off-target.`
    : `We help teams like yours get ${fallbackIntent === 'career' ? 'great operators' : 'faster revenue lift'} without the usual thrash.`

  return {
    intent: primaryIntent,
    fallback: fallbackIntent,
    cal_proposal: calLine,
    variants: {
      short: `Hey ${name.split(' ')[0] || 'there'} — open to a quick chat? ${hook} ${calLine}`.trim(),
      standard: `Hey ${name.split(' ')[0] || 'there'},\n\n${hook} If it’s not a fit on the ${primaryIntent} front, happy to pivot to ${fallbackIntent} value. ${calLine}`.trim(),
      followup: `Bumping this in case it slipped. Open to a quick async chat? If now’s bad, no worries—can circle back later. ${calLine}`.trim()
    }
  }
}
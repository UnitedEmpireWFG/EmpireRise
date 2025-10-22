// backend/lib/ai_messages.js
import { aiComplete } from './ai.js'

const SYS_STYLE = `You are EmpireRise's outreach assistant.
- Tone: brief, upbeat, confident, never salesy.
- No emojis, no exclamation spam.
- 300 characters max unless asked.
- Always personalize with role/company if provided.
- Avoid pushy asks; favor a crisp, specific next step.`

function trimHard(s, max = 500) {
  if (!s) return ''
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

export async function generateIntroMessage(ctx) {
  const { name, title, company, headline, location } = ctx || {}
  const prompt = `
Write a single short LinkedIn DM to a 1st-degree connection to start a conversation.

Recipient:
- Name: ${name || 'Unknown'}
- Title: ${title || 'Unknown'}
- Company: ${company || 'Unknown'}
- Headline: ${headline || 'Unknown'}
- Location: ${location || 'Unknown'}

Constraints:
- 1–2 sentences.
- No clichés like "pick your brain".
- End with an easy question relevant to their role.
Return ONLY the message body.`

  const out = await aiComplete({ system: SYS_STYLE, prompt })
  return trimHard(out, 350)
}

export async function generateNurtureFollowup(ctx) {
  const { name, recent_topic } = ctx || {}
  const prompt = `
Write a short LinkedIn follow-up DM that re-engages a warm connection.

Context:
- Name: ${name || 'there'}
- Thread topic: ${recent_topic || 'recent work'}

Constraints:
- 1 sentence if possible, 2 max.
- Reference the topic subtly, then ask a specific low-friction question.
- No pressure. Return ONLY the message body.`

  const out = await aiComplete({ system: SYS_STYLE, prompt })
  return trimHard(out, 280)
}
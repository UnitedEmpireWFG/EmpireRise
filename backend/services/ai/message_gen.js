// backend/services/ai/message_gen.js
import { aiComplete } from '../../lib/ai.js'

/**
 * Generate a short, polite LinkedIn intro DM.
 * Returns { text, variant, meta }
 */
export async function genIntroDM({ prospect, userProfile, style = 'friendly' }) {
  const p = prospect || {}
  const u = userProfile || {}

  const brief = {
    you: {
      name: u.name || 'Bassem',
      role: u.role || 'Advisor',
      company: u.company || 'EmpireRise',
      region: u.region || 'Edmonton, AB',
      value_prop: u.value_prop || 'simple, judgment-free planning that helps households keep more of what they earn'
    },
    tone: style,
    constraints: [
      '≤ 500 characters',
      'no hard pitch',
      '1 crisp hook + 1 value sentence + soft CTA',
      'no emojis, no links, no bullet points'
    ]
  }

  const prompt = `
You craft excellent first LinkedIn DMs. Output the MESSAGE ONLY (no quotes).

Prospect:
- Name: ${p.full_name || 'there'}
- Role/headline: ${p.headline || 'N/A'}
- Company: ${p.company || 'N/A'}
- Region: ${p.region || 'N/A'}
- Connection: ${p.connection_degree || 'N/A'}

Author JSON:
${JSON.stringify(brief, null, 2)}

Write one message that feels human, local, and relevant to the prospect's role. Soft CTA could be "open to a quick intro?".
`.trim()

  const text = (await aiComplete(prompt)).trim()
  return {
    text,
    variant: 'intro_v1',
    meta: { len: text.length, style }
  }
}
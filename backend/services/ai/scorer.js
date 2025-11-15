// backend/services/ai/scorer.js
import { aiComplete } from '../../lib/ai.js'

/**
 * Score a single prospect 0..100 and return a compact rationale.
 * Safe JSON decoding with fallbacks.
 */
export async function scoreProspect(prospect, userHint = {}) {
  const {
    full_name = '',
    headline = '',
    company = '',
    region = '',
    connection_degree = '',
    note = ''
  } = prospect || {}

  const userBrief = JSON.stringify({
    industry: userHint.industry || 'financial services',
    ideal_customer: userHint.ideal_customer || 'Canada residents seeking improved financial literacy and planning',
    region_focus: userHint.region_focus || 'Alberta / Edmonton',
    disqualifiers: userHint.disqualifiers || ['students under 21', 'non-English speakers (for now)'],
    positives: userHint.positives || ['manager or above', 'self-employed', 'new homeowners', 'parents']
  })

  const prompt = `
You are a precise lead scorer. Output STRICT JSON ONLY. No prose.

Prospect:
- Name: ${full_name || 'N/A'}
- Headline: ${headline || 'N/A'}
- Company: ${company || 'N/A'}
- Region: ${region || 'N/A'}
- LI Connection: ${connection_degree || 'N/A'}
- Notes: ${note || 'N/A'}

My ICP (guidance JSON):
${userBrief}

Return JSON with:
{
  "score": 0-100 integer,
  "why": "one-line reason",
  "tags": ["short","tags"],
  "risk": "short risk if any"
}
  `.trim()

  const raw = await aiComplete(prompt)
  let out = { score: 0, why: 'n/a', tags: [], risk: '' }
  try {
    out = { ...out, ...JSON.parse(safeJson(raw)) }
  } catch {}
  // clamp and coerce
  const score = Math.max(0, Math.min(100, Number(out.score || 0)))
  return { score, why: String(out.why || ''), tags: Array.isArray(out.tags) ? out.tags : [], risk: String(out.risk || '') }
}

// tolerate minor JSON noise
function safeJson(s) {
  // strip code fences or trailing commas occasionally emitted by LLMs
  return String(s || '')
    .replace(/```json|```/g, '')
    .replace(/,(\s*[}\]])/g, '$1')
}
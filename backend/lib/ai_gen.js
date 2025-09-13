// backend/lib/ai_gen.js
// Robust, template-free generator using your aiComplete() wrapper
import { aiComplete } from "./ai.js"
import { classifySentiment } from "./ai_policy.js"

/* ---------- tiny helpers ---------- */

function lastAssistantSaidHello(history = []) {
  const lastAssistant = [...(history || [])].reverse().find(m => m.role === "assistant")
  if (!lastAssistant) return false
  const t = String(lastAssistant.text || "").toLowerCase()
  return /\b(hi|hey|hello|good (morning|afternoon|evening))\b/.test(t)
}

function stateHint(state = "intro", persona = "client") {
  const p = persona === "recruit" ? "recruiting" : "client"
  switch (state) {
    case "intro":     return `Goal: open a light thread for ${p}. Ask one easy, specific question.`
    case "probe1":    return "Goal: discover one priority. Ask about one focus area only."
    case "probe2":    return "Goal: qualify with one detail (timing, budget, urgency)."
    case "objection": return "Goal: acknowledge, reflect back their concern, and suggest a softer next step or a later check-in."
    case "offer":     return "Goal: propose one concrete time window and ask for confirmation."
    case "booked":    return "Goal: confirm booking and ask for one prep item."
    default:          return "Goal: move the conversation forward by one small step."
  }
}

function platformTone(platform = "linkedin") {
  const p = String(platform || "").toLowerCase()
  if (p === "linkedin") return "Use a professional, concise tone. Sentence case. No fluff."
  if (p === "instagram" || p === "facebook") return "Keep it warm, plain-language, and direct. Sentence case."
  if (p === "sms" || p === "text") return "Be direct, brief, and respectful."
  return "Use clear, concise tone."
}

function buildABNotes(ab = {}) {
  const parts = []
  if (ab?.hookVariant)      parts.push(`Hook variant: ${ab.hookVariant}.`)
  if (ab?.bridgeVariant)    parts.push(`Bridge variant: ${ab.bridgeVariant}.`)
  if (ab?.objectionVariant) parts.push(`Objection variant: ${ab.objectionVariant}.`)
  if (ab?.closeVariant)     parts.push(`Close variant: ${ab.closeVariant}.`)
  return parts.join(" ")
}

function deriveIntent(state = "intro", path = "client") {
  if (state === "probe1") return "probe_problem"
  if (state === "probe2") return "layer_values"
  if (state === "offer")  return path === "recruit" ? "offer_webinar" : "offer_1on1"
  return "observe"
}

function enforceOneQuestion(text = "") {
  // Keep only up to the first question mark to enforce a single ask
  const first = text.indexOf("?")
  if (first === -1) return text
  const second = text.indexOf("?", first + 1)
  if (second === -1) return text
  return text.slice(0, second).trim()
}

function detectRegion(loc = "") {
  const t = String(loc || "").toLowerCase()
  // very light heuristic; backend offers.js will do the real scheduling logic
  if (/(ontario|toronto|ottawa|mississauga|hamilton|gta|montreal|quebec|halifax|saint john|moncton|charlottetown|fredericton|st\.?\s*john'?s?|\bnl\b|\bnf\b|pei|ns|nb|qc|on|east)/i.test(t)) {
    return "east"
  }
  if (/(alberta|edmonton|calgary|bc|british columbia|vancouver|winnipeg|saskatoon|regina|yukon|nwt|whitehorse|yellowknife|ab|bc|mb|sk|west)/i.test(t)) {
    return "west"
  }
  return "unknown"
}

function buildPrompt(ctx) {
  const hist = (ctx.history || [])
    .map(m => `${m.role === "assistant" ? "You" : "Prospect"}: ${m.text}`)
    .join("\n")

  const helloBlock = lastAssistantSaidHello(ctx.history)
    ? "Do not greet again."
    : "You may greet once (very short), only if natural."

  const abNotes = buildABNotes(ctx.ab || {})
  const hint    = stateHint(ctx.state, ctx.persona)
  const tone    = platformTone(ctx.platform)
  const path    = ctx.path || (ctx.persona === "recruit" ? "recruit" : "client")
  const intent  = deriveIntent(ctx.state, path)
  const profile = JSON.stringify(ctx.profile || {})
  const region  = detectRegion(ctx?.profile?.location || ctx?.profile?.city || "")

  return `
You are a pragmatic, emotionally intelligent outreach assistant for financial advising in Canada.
- No scripts or templates. Write like a real human.
- Use their profile/history to be specific and fresh.
- One idea per message, under 60 words.
- Ask only ONE question in this message.
- Micro-commitments > big asks. Be empathetic; mirror their phrasing.
- If they said “no” to both recruit and client paths, politely pivot to a referral ask in later turns (not necessarily now).
- Recruit webinars: West Canada Tue 7pm MT, East Canada Thu 5pm MT; frame as occasional/limited. If not available, default to 1:1.
- If they’re in Edmonton, when proposing a 1:1 you can offer optional in-person at 9910 39 Ave (gesture only; do not push).
- No emojis. No links unless already discussed.

Context
- Persona: ${ctx.persona || "client"}
- Platform: ${ctx.platform}
- State: ${ctx.state}
- Path: ${path}
- Intent: ${intent}
- Last sentiment: ${ctx.last_sentiment || "neutral"}
- Prospect region (heuristic): ${region}
- Profile JSON: ${profile}

Conversation rules:
${helloBlock}
Avoid repeating the last assistant message.
${tone}
${abNotes ? `Experiment notes: ${abNotes}` : ""}

Guidance:
${hint}

Recent history:
${hist || "(none)"}

Write the next SINGLE outbound message only. Output ONLY the message text (no quotes).
`.trim()
}

function simpleFallback(ctx = {}) {
  const name = ctx.profile?.name ? ` ${ctx.profile.name}` : ""
  switch (ctx.state) {
    case "intro":     return `Hey${name}. Open to a quick chat this week about tightening costs and growing your plan?`
    case "probe1":    return "What’s been the toughest part of your finances lately?"
    case "probe2":    return "If that changed, what would it free up for you over the next 6–12 months?"
    case "objection": return "Totally fair. Would it help if I checked back in a month?"
    case "offer":     return "I can do Tue 12–3 or Thu 5–7 MT—does either work for you?"
    case "booked":    return "Awesome—anything you’d like me to prep before we meet?"
    default:          return "Mind if I ask one quick question to make this useful?"
  }
}

/* ---------- main export ---------- */

export async function generateMessage(ctx = {}) {
  try {
    const prompt = buildPrompt(ctx)
    const raw = await aiComplete(prompt) // your wrapper returns plain text
    const msg = String(raw || "").trim()
    const normalized = enforceOneQuestion(msg.replace(/\s+\n/g, " ").replace(/\n+/g, " ").slice(0, 600))

    // sentiment + meta for learning loop
    const sentiment = classifySentiment(normalized)
    const askedQuestion = /\?/.test(normalized)
    const containsGreeting = /\b(hi|hey|hello|good (morning|afternoon|evening))\b/i.test(normalized)
    const wordCount = normalized.split(/\s+/).filter(Boolean).length

    const pathHint = ctx.path || (ctx.persona === "recruit" ? "recruit" : "client")
    const intent   = deriveIntent(ctx.state, pathHint)
    const askedOffer = intent === "offer_webinar" || intent === "offer_1on1"

    const safeText = normalized || simpleFallback(ctx)

    return {
      ok: true,
      text: safeText,
      sentiment,
      askedOffer,
      meta: {
        platform: ctx.platform || "unknown",
        persona: ctx.persona || "client",
        state: ctx.state || "intro",
        pathHint,
        intent,
        asked_offer: askedOffer,
        asked_question: askedQuestion,
        contains_greeting: containsGreeting,
        word_count: wordCount,
        ab: ctx.ab || {}
      }
    }
  } catch (e) {
    const fallback = simpleFallback(ctx)
    return {
      ok: false,
      text: fallback,
      sentiment: classifySentiment(fallback),
      askedOffer: false,
      meta: { error: true, reason: String(e?.message || e) }
    }
  }
}

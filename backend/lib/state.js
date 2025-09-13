// backend/lib/state.js
import { supa } from "../db.js"
import { classifySentiment } from "./ai_policy.js"

// Lightweight cues → path
const CLIENT_CUES  = /\b(policy|coverage|premium|quote|retirement|invest|tfsa|rrsp|mortgage|insurance)\b/i
const RECRUIT_CUES = /\b(hiring|career|side\s*income|opportunity|part[- ]?time|extra money|webinar)\b/i
const REFERRAL_CUES= /\b(friend|family|someone|anyone you know|referr)/i

export function decidePath(text) {
  if (RECRUIT_CUES.test(text)) return "recruit"
  if (CLIENT_CUES.test(text))  return "client"
  if (REFERRAL_CUES.test(text))return "referral"
  return null
}

// Finite states
// intro → probe1 → probe2 → offer → booked  (with possible objection loops)
export function nextState(curr, { positive, askedOffer = false }) {
  switch (curr || "intro") {
    case "intro":   return "probe1"
    case "probe1":  return positive ? "probe2" : "probe1"
    case "probe2":  return askedOffer ? "offer" : "probe2"
    case "offer":   return positive ? "booked" : "objection"
    case "objection": return positive ? "offer" : "probe2"
    default:        return curr || "intro"
  }
}

// Update (path/state/sentiment) off a new inbound text
export async function absorbInbound({ contact_id, platform, text }) {
  // find/create thread
  let { data: th } = await supa
    .from("conv_threads")
    .select("*")
    .eq("contact_id", contact_id)
    .eq("platform", platform)
    .maybeSingle()

  const sentiment = classifySentiment(text) // "pos" | "neutral" | "neg"
  const path = th?.path || decidePath(text)

  // advance state optimistically on any inbound
  const newState = nextState(th?.state || "intro", { positive: sentiment === "pos" })
  const now = new Date().toISOString()

  if (!th) {
    const ins = await supa.from("conv_threads")
      .insert({ contact_id, platform, state: newState, sentiment, path, last_event_at: now })
      .select().maybeSingle()
    th = ins.data
  } else {
    await supa.from("conv_threads")
      .update({ state: newState, sentiment, path, last_event_at: now })
      .eq("id", th.id)
  }

  // save inbound message
  await supa.from("conv_messages").insert({
    thread_id: th.id, role: "user", text, sentiment,
    features: { cues: { client: CLIENT_CUES.test(text), recruit: RECRUIT_CUES.test(text) } }
  })

  return th
}

// Mark that we offered something (used to jump to `offer`)
export async function markOffered(threadId, last_offer) {
  await supa.from("conv_threads")
    .update({ state: "offer", last_offer, last_event_at: new Date().toISOString() })
    .eq("id", threadId)
}

// Small helper for UI tables
export async function joinLeadWithThread(leadRows) {
  if (!leadRows?.length) return leadRows
  const ids = [...new Set(leadRows.map(r => r.id))]

  const { data: threads } = await supa
    .from("conv_threads")
    .select("id, contact_id, state, path, sentiment, last_offer")
    .in("contact_id", ids)

  const map = new Map((threads||[]).map(t => [t.contact_id, t]))
  return leadRows.map(l => {
    const th = map.get(l.id)
    return { ...l,
      thread_state: th?.state || "intro",
      thread_path: th?.path || null,
      thread_sentiment: th?.sentiment || null,
      thread_last_offer: th?.last_offer || null
    }
  })
}

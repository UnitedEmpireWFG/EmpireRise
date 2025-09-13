export function classifySentiment(text = "") {
const t = (text || "").toLowerCase()
if (!t.trim()) return "neutral"

const neg = /(not interested|no thanks|stop|do not contact|unsubscribe|leave me alone|not now|busy|fuck off|go away)/
if (neg.test(t)) return "neg"

const pos = /(yes|yeah|yep|great|good|interested|keen|sounds good|sure|okay|ok|let us talk|let's talk|book|schedule|set it up)/
if (pos.test(t)) return "pos"

return "neutral"
}

export function extractSignals(text = "") {
const t = (text || "").toLowerCase()

const intents = []
if (/(invest|rrsp|tfsa|portfolio|fund|return|market)/.test(t)) intents.push("investing")
if (/(insurance|life|term|whole|policy|beneficiary|coverage)/.test(t)) intents.push("insurance")
if (/(mortgage|refi|refinance|rate|home loan)/.test(t)) intents.push("mortgage")
if (/(job|career|part time|full time|license|recruit|join your team)/.test(t)) intents.push("career")
if (/(money|budget|debt|savings|cash flow)/.test(t)) intents.push("money")
if (/(refer|referral|my friend|my brother|sister|coworker)/.test(t)) intents.push("referral")
if (/(book|schedule|when works|time tomorrow|call)/.test(t)) intents.push("booking")

let emotion = 50
const strongPos = /(amazing|awesome|perfect|love it|excited|stoked|fantastic)/
const strongNeg = /(angry|annoyed|upset|scam|hate|terrible|awful)/
if (strongPos.test(t)) emotion = 80
if (strongNeg.test(t)) emotion = 20
const exclamations = (t.match(/!/g) || []).length
if (exclamations >= 2) emotion = Math.min(100, emotion + 10)

const cues = {
times: (t.match(/\b(mon|tue|wed|thu|fri|sat|sun)\b|\b\d{1,2}(:\d{2})?\s*(am|pm)\b/g) || []),
numbers: (t.match(/\b\d+(.\d+)?\b/g) || []),
locations: (t.match(/\b(edmonton|calgary|alberta|canada|zoom|phone|call)\b/g) || [])
}

return { intents, emotion, cues }
}

export function choosePath(thread = {}, contact = {}) {
const text = (thread.lastUserText || thread.last_user_text || "").toLowerCase()
const tags = Array.isArray(contact.tags) ? contact.tags.map(x => (x || "").toLowerCase()) : []

if (/refer|referral|friend|family|coworker/.test(text)) return "referral"

if (/job|career|part time|full time|license|recruit|join your team|side income/.test(text)) return "recruit"
if (tags.includes("recruit")) return "recruit"

if (/invest|rrsp|tfsa|portfolio|insurance|policy|coverage|mortgage|refi|refinance|rate/.test(text)) return "client"
if (tags.includes("client") || tags.includes("prospect")) return "client"

return "client"
}

export function nextState(thread = {}, lastUserMsg = "") {
const current = thread.state || "intro"
const t = (lastUserMsg || "").toLowerCase()

const isNo = /(not interested|no thanks|stop|do not contact|busy|another time|later)/
const wantsTime = /(book|schedule|call|zoom|when works|time|tomorrow|today|this week)/
const softYes = /(yes|yeah|yep|sure|okay|ok|interested|sounds good|keen)/

if (current === "intro") return "probe1"

if (current === "probe1") {
if (isNo.test(t)) return "objection"
if (wantsTime.test(t)) return "offer"
if (softYes.test(t)) return "probe2"
return "probe1"
}

if (current === "probe2") {
if (isNo.test(t)) return "objection"
if (wantsTime.test(t)) return "offer"
if (softYes.test(t)) return "offer"
return "probe2"
}

if (current === "objection") {
if (softYes.test(t) || wantsTime.test(t)) return "probe2"
return "objection"
}

if (current === "offer") {
if (/(confirmed|booked|see you|locked in|works for me)/.test(t)) return "booked"
if (wantsTime.test(t)) return "offer"
return "offer"
}

if (current === "booked") return "booked"

return current
}

/*
Optional simple state advance, consistent with your FSM
*/
export function advanceState(prev = "probe1", lastUserText = "") {
const t = (lastUserText || "").toLowerCase()
if (prev === "probe1" && /(yes|sure|ok|okay|interested|sounds good)/.test(t)) return "probe2"
if (prev === "probe2" && /(book|schedule|time|call|zoom)/.test(t)) return "offer"
if (prev === "offer" && /(confirmed|booked|see you|locked in|works for me)/.test(t)) return "booked"
return prev
}

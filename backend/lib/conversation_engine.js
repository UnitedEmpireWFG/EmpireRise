import { aiComplete } from "./ai.js";

/**
 * Compute the next stage based on prior interactions.
 * Stages:
 * 1 intro
 * 2 probe
 * 3 probe
 * 4 probe
 * 5 soft qualify + micro agreement
 * 6 offer path A/B (webinar vs 1 on 1) per your rules
 * 7 referral ask (only after 1 on 1 path was discussed or declined)
 */
export function decideStage(history = [], flags = {}) {
  // Count our sent messages and their outcomes
  const sent = history.filter(m => m.role === "assistant" && m.kind === "sent");
  const replies = history.filter(m => m.role === "user" && m.kind === "reply");
  const lastReply = replies[replies.length - 1];

  if (flags?.do_not_contact) return 0; // stop

  // If user said stop or negative, stop
  if (lastReply && /stop|unsubscribe|no thanks|not interested/i.test(lastReply.body || "")) {
    return 0;
  }

  const n = sent.length;

  if (n <= 0) return 1;        // intro
  if (n === 1) return 2;       // probe
  if (n === 2) return 3;       // probe
  if (n === 3) return 4;       // deeper probe
  if (n === 4) return 5;       // soft qualify + micro agreement
  if (n === 5) return 6;       // A/B close
  return 7;                    // referral or long followup
}

/**
 * Build a system prompt that locks tone and rules.
 */
function systemPrompt() {
  return [
    "You write first-touch and follow-up DMs for Canadian prospects.",
    "Keep it warm, concise, human, 140 to 240 chars.",
    "Never hard sell. Never drop a raw link unless they agree to proceed.",
    "One thoughtful question per message.",
    "Respect that this is message-by-message. No numbered lists.",
    "Mirror the prospect’s words lightly. Acknowledge family or cost-of-living when relevant.",
    "Use Canadian spelling where natural.",
    "Do not use emojis.",
  ].join(" ");
}

/**
 * Build a user prompt for the chosen stage.
 * Inputs include persona, city, intent focus, prior snippets, and your business rules.
 */
function userPrompt({ contact, stage, history, preferIntent }) {
  const name = contact?.name || "there";
  const city = contact?.city || "your area";
  const platform = contact?.platform || "LinkedIn";
  const persona = contact?.persona || "general";
  const notes = contact?.notes || "";
  const flags = contact?.flags || "";

  // Pull last two messages for context
  const lastUser = [...history].reverse().find(m => m.role === "user");
  const lastAssistant = [...history].reverse().find(m => m.role === "assistant");

  const common = [
    `Prospect: ${name}, City: ${city}, Platform: ${platform}, Persona: ${persona}`,
    `Notes: ${notes || "n/a"}`,
    `Flags: ${flags || "n/a"}`,
    lastUser ? `Last reply from prospect: "${trimForPrompt(lastUser.body)}"` : "No reply yet.",
    lastAssistant ? `Our last message: "${trimForPrompt(lastAssistant.body)}"` : "No prior message sent by us.",
    `Preference focus now: ${preferIntent || "auto"}  // auto = choose client or recruit based on profile`,
    "",
    "Rules to respect:",
    "- One question max.",
    "- No hard sell.",
    "- No direct link until they agree to proceed.",
    "- If in a relationship, you can gently mention involving spouse only at booking step, not earlier.",
    "- If Edmonton and they prefer 1 on 1 later, office is 9910 39 Ave NW.",
  ].join("\n");

  if (stage === 1) {
    return `${common}
Task: Write an intro DM. Light, human, zero pitch. Ask one small question related to city, recent posts, or their bio.
Output: One single-line DM under 240 chars.`;
  }

  if (stage === 2 || stage === 3 || stage === 4) {
    return `${common}
Task: Write a probing follow-up. Mirror something from their profile or last reply. Keep it natural. Do not push.
Ask one thoughtful question that invites a short answer.
Output: One single-line DM under 240 chars.`;
  }

  if (stage === 5) {
    return `${common}
Task: Soft qualify and seek a micro agreement. Acknowledge their situation. Do not pitch services.
Ask a small yes/no style question that advances the conversation.
Output: One single-line DM under 240 chars.`;
  }

  if (stage === 6) {
    return `${common}
Task: Offer a next step with A/B close based on location and interest. 
If they seem like a client fit, prefer an intro call first. Casual mention that people often find it helpful and there is no cost to sit down.
If recruit fit, frame a short info session (webinar) aligned to region. Western Canada Tuesday 7 pm MT. Eastern Canada Thursday 5 pm MT. Offer only the appropriate one by location, not both.
Ask one question to confirm preference. Do not paste any link.
Output: One single-line DM under 240 chars.`;
  }

  // stage 7
  return `${common}
Task: If 1 on 1 was declined or not a fit, ask for a referral gently. Tie back to their hot buttons if known.
Keep it short. One question max. No pitch.
Output: One single-line DM under 240 chars.`;
}

function trimForPrompt(s = "") {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 220 ? t.slice(0, 220) + "..." : t;
}

/**
 * Generate the next message body given contact, history, and your rules.
 */
export async function generateNextMessage({ contact, history = [], preferIntent }) {
  const stage = decideStage(history, { do_not_contact: contact?.do_not_contact });
  if (stage === 0) return null;
  const sys = systemPrompt();
  const usr = userPrompt({ contact, stage, history, preferIntent });
  const text = await aiComplete(usr, sys);
  return { text, stage };
}


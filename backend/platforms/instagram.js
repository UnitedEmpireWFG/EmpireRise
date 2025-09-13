import { normLead, guardText } from "./_base.js"

export default {
  key: "instagram",
  plan(lead) {
    const L = normLead(lead)
    return [
      { kind: "like", track: "warmup" },
      { kind: "comment", track: "warmup", body: guardText("Clean work. How often are you posting lately?") },
      { kind: "dm", track: "convo", body: guardText(`Respect the consistency ${L.name ? L.name.split(" ")[0] : ""}. Do you usually train mornings or evenings?`) }
    ]
  },
  rules: { dmMax: 220, noLinksFirstDM: true, storyReplyFallbackHours: 48 }
}

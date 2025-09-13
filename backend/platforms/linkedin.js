import { normLead, guardText } from "./_base.js"

export default {
  key: "linkedin",
  plan(lead) {
    const L = normLead(lead)
    return [
      { kind: "like", track: "warmup" },
      { kind: "comment", track: "warmup", body: guardText("Strong insight. What led you there?") },
      { kind: "dm", track: "convo", body: guardText(`Hey ${L.name.split(" ")[0] || ""}, appreciated your update. What are you focused on this quarter?`) }
    ]
  },
  rules: { dmMax: 280, noLinksFirstDM: true }
}

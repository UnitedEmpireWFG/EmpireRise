import { normLead, guardText } from "./_base.js"

export default {
  key: "tiktok",
  plan() {
    return [
      { kind: "like", track: "warmup" },
      { kind: "comment", track: "warmup", body: guardText("Solid clip. What was the hardest part to get right?") },
      { kind: "dm", track: "convo", body: guardText("Respect the pace. Do you batch or post daily?") }
    ]
  },
  rules: { dmMax: 220, noLinksFirstDM: true }
}

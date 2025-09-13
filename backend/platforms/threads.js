import { normLead, guardText } from "./_base.js"

export default {
  key: "threads",
  plan() {
    return [
      { kind: "like", track: "warmup" },
      { kind: "comment", track: "warmup", body: guardText("Interesting take. What sparked it?") },
      { kind: "dm", track: "convo", body: guardText("Appreciate your posts. What are you focusing on right now?") }
    ]
  },
  rules: { dmMax: 300, noLinksFirstDM: true }
}

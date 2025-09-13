import { normLead, guardText } from "./_base.js"

export default {
  key: "reddit",
  plan() {
    return [
      { kind: "comment", track: "warmup", body: guardText("Good breakdown. What source did you like most?") },
      { kind: "dm", track: "convo", body: guardText("Saw your comment. What are you working toward with this?") }
    ]
  },
  rules: { dmMax: 500, noLinksFirstDM: true }
}

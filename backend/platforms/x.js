import { normLead, guardText } from "./_base.js"

export default {
  key: "x",
  plan(lead) {
    const L = normLead(lead)
    return [
      { kind: "like", track: "warmup" },
      { kind: "comment", track: "warmup", body: guardText("Good point. What made you test that?") },
      { kind: "dm", track: "convo", body: guardText(`Saw your post ${L.name ? L.name.split(" ")[0] : ""}. What are you optimizing for this month?`) }
    ]
  },
  rules: { dmMax: 280, noLinksFirstDM: true }
}

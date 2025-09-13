import { normLead, guardText } from "./_base.js"

export default {
  key: "facebook",
  plan(lead) {
    const L = normLead(lead)
    return [
      { kind: "like", track: "warmup" },
      { kind: "comment", track: "warmup", body: guardText("Nice update. What helped most here?") },
      { kind: "dm", track: "convo", body: guardText(`Hey ${L.name ? L.name.split(" ")[0] : ""}, saw your post earlier. What are you building right now?`) }
    ]
  },
  rules: { dmMax: 500, noLinksFirstDM: true }
}

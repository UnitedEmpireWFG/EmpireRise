import { guardText } from "./_base.js"

export default {
  key: "youtube",
  plan() {
    return [
      { kind: "like", track: "warmup" },
      { kind: "comment", track: "warmup", body: guardText("Helpful video. What led you to try that approach?") },
      { kind: "dm", track: "convo", body: guardText("Appreciated your video. What are you aiming to grow next?") }
    ]
  },
  rules: { dmMax: 500, noLinksFirstDM: true }
}

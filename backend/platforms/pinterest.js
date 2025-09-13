import { guardText } from "./_base.js"

export default {
  key: "pinterest",
  plan() {
    return [
      { kind: "like", track: "warmup" },
      { kind: "comment", track: "warmup", body: guardText("Nice board. What inspired this theme?") },
      { kind: "dm", track: "convo", body: guardText("Enjoyed your board. Are you building anything around this?") }
    ]
  },
  rules: { dmMax: 300, noLinksFirstDM: true }
}

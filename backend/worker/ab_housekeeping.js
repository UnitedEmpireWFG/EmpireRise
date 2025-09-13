// backend/worker/ab_housekeeping.js
import { supa } from "../db.js"

export function startABHousekeepingCron() {
  setInterval(async () => {
    const { data } = await supa.from("ab_variants").select("*").gte("trials", 20).eq("active", true)
    for (const v of (data||[])) {
      const rate = (v.wins || 0) / (v.trials || 1)
      if (rate < 0.08) {
        await supa.from("ab_variants").update({ active:false }).eq("id", v.id)
      }
    }
  }, 12*60*60*1000) // twice daily
}

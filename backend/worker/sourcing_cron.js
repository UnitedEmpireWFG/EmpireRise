import { metaHarvestAll } from "../lib/meta_api.js";
import { liHarvestRecentEngagers } from "../lib/linkedin_api.js";

const EVERY_MINUTES = 30;
let t = null;

async function tick() {
  try {
    const m = await metaHarvestAll();
    const l = await liHarvestRecentEngagers();
    console.log("[sourcing] meta", m);
    console.log("[sourcing] linkedin", l);
  } catch (e) {
    console.log("[sourcing] error", e.message);
  }
}

export function startSourcingCron() {
  if (t) return;
  console.log(`[sourcing] starting every ${EVERY_MINUTES}m`);
  t = setInterval(tick, EVERY_MINUTES * 60 * 1000);
  tick();
}

import cron from "node-cron";
import { runWarmupBatch, runReengagement, dispatchScheduled } from "./workers.js";

cron.schedule("*/10 * * * *", async () => { try { await runWarmupBatch(); } catch(e) { console.error(e); } });
cron.schedule("0 */6 * * *", async () => { try { await runReengagement(); } catch(e) { console.error(e); } });
cron.schedule("*/5 * * * *", async () => { try { await dispatchScheduled(); } catch(e) { console.error(e); } });


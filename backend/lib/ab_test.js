// backend/lib/ab_test.js
import { supa } from "../db.js"

// simple epsilon-greedy
const EPS = 0.20

export async function pickVariant(slot) {
  const { data: variants } = await supa
    .from("ab_variants")
    .select("*")
    .eq("slot", slot)
    .eq("active", true)

  const list = variants || []
  if (list.length === 0) return null

  // explore
  if (Math.random() < EPS) {
    const v = list[Math.floor(Math.random() * list.length)]
    await recordTrial(v.id)
    return v
  }

  // exploit: best win rate (wins/trials), break ties randomly
  const scored = list.map(v => ({
    ...v,
    rate: v.trials > 0 ? v.wins / v.trials : 0
  }))
  const bestRate = Math.max(...scored.map(s => s.rate))
  const best = scored.filter(s => s.rate === bestRate)
  const pick = best[Math.floor(Math.random() * best.length)]
  await recordTrial(pick.id)
  return pick
}

export async function recordTrial(variantId) {
  await supa.rpc("ab_inc_trials", { vid: variantId }).catch(async () => {
    // fallback if RPC not installed
    await supa.from("ab_variants").update({ trials: supa.sql`trials + 1` }).eq("id", variantId)
  })
}

export async function recordWin(variantId) {
  await supa.rpc("ab_inc_wins", { vid: variantId }).catch(async () => {
    await supa.from("ab_variants").update({ wins: supa.sql`wins + 1` }).eq("id", variantId)
  })
}

/**
 * Cull weak variants (run nightly)
 * - deactivate after >= 50 trials and win rate < 10%
 */
export async function cullLosers() {
  const { data } = await supa
    .from("ab_variants")
    .select("id, trials, wins, active")
    .eq("active", true)

  const losers = (data || []).filter(v => v.trials >= 50 && (v.wins / Math.max(1, v.trials)) < 0.10)
  if (losers.length) {
    await supa.from("ab_variants").update({ active: false }).in("id", losers.map(l => l.id))
  }
}

// Optional: create helpers as SQL functions (faster counters)
export const rpcSQL = `
create or replace function ab_inc_trials(vid uuid) returns void
language sql as $$ update ab_variants set trials = trials + 1 where id = vid $$;
create or replace function ab_inc_wins(vid uuid) returns void
language sql as $$ update ab_variants set wins = wins + 1 where id = vid $$;
`;

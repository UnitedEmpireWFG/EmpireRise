import { supa } from "../db.js";
export const defaults = {
  send_windows: [{start:"09:00",end:"12:00"},{start:"14:00",end:"18:00"}],
  li_daily_msgs: 85,
  ig_daily_actions: 120,
  fb_daily_actions: 120,
  cooldown_contact_days: 1,
  burst_min: 1, burst_max: 3,
  gap_min_sec: 180, gap_max_sec: 480,
  fail_threshold_pct: 15,
  quiet_hours_end: 20
};
export async function getSettings(user="default"){ return defaults; }
export function inside(now, windows){
  const hh = String(now.getHours()).padStart(2,"0");
  const mm = String(now.getMinutes()).padStart(2,"0");
  const t = `${hh}:${mm}`;
  return (windows||[]).some(w => w.start <= t && t <= w.end);
}
export function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }


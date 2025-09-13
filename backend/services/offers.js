6) GROWTH SCHEDULER (CONNECTIONS + WARMUP)
File: backend/worker/growth_scheduler.js
- Every tick:
  a) Respect per-platform add caps (LinkedIn 80/d, IG 60/d, FB 60/d or your settings).
  b) Dequeue from connect_queue (status='queued' and scheduled_at<=now) → send connect.
  c) For accepted connects (polling), enqueue warmup tasks:
     • warm_like (1–2 posts)
     • warm_comment (1 post, short, relevant)
     • first_outreach after 24–48h delay (goes to approvals first if LI; auto on Meta if you allow).

- Export startGrowthScheduler(); call it in server.js after app.listen.

7) OFFER LOGIC (WEBINAR VS 1:1 + REFERRAL)
File: backend/services/offers.js
export function nextOfferFor(contact, thread) {
  // If path is 'recruit': try webinar by location; else 1:1
  // If path is 'client': always 1:1
  // If declines both: fallback 'referral'
}

Webinar schedule seed (insert into webinar_events):
  west → weekday=2 (Tue) 19:00 MT, tz 'America/Edmonton'
  east → weekday=4 (Thu) 17:00 MT, tz 'America/Toronto'
Frame as “special session”, not recurring. Compute next date >= tomorrow. If none fit → 1:1 fallback.

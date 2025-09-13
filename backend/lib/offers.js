// backend/lib/offers.js
import { supa } from "../db.js"
import { markOffered } from "./state.js"

function pickWebinarByLocation(loc) {
  // West Canada: Tue 7pm MT -> "west"
  // East Canada: Thu 5pm MT -> "east"
  const isWest = /\b(BC|Alberta|AB|Edmonton|Calgary|MT|Pacific|Vancouver)\b/i.test(loc || "")
  return isWest ? "west" : "east"
}

export async function proposeRecruitWebinar(thread) {
  // read configured webinar events
  const code = pickWebinarByLocation(thread?.metadata?.location || "")
  const { data: ev } = await supa.from("webinar_events").select("*").eq("code", code).maybeSingle()
  if (!ev) return { ok:false, error:"webinar_not_configured" }

  await markOffered(thread.id, code)
  return {
    ok:true,
    offer: { kind:"webinar", code, display: ev.display_name, framing: ev.framing }
  }
}

export async function registerWebinar({ contact_id, code }) {
  // store registration intent; if you have a reg_endpoint, call it here
  const { data: th } = await supa
    .from("conv_threads").select("id").eq("contact_id", contact_id).maybeSingle()
  if (th) await markOffered(th.id, code)
  return { ok:true }
}

export async function proposeClientSlots({ contact_id }) {
  // Very simple “two best next slots” example.
  // If you already have backend/ lib/calendly.js, call its `findTwoSlots()`.
  const now = new Date()
  const a = new Date(now.getTime() + 2*24*3600*1000); a.setHours(10, 0, 0, 0)
  const b = new Date(now.getTime() + 3*24*3600*1000); b.setHours(14, 30, 0, 0)

  const slots = [
    { id: `s-${a.getTime()}`, iso: a.toISOString(), label: a.toLocaleString() },
    { id: `s-${b.getTime()}`, iso: b.toISOString(), label: b.toLocaleString() },
  ]

  const { data: th } = await supa
    .from("conv_threads").select("id").eq("contact_id", contact_id).maybeSingle()
  if (th) await markOffered(th.id, "1on1")

  return { ok:true, slots }
}

export async function bookClientSlot({ contact_id, slot_id, in_person }) {
  // Hook into Calendly if present; else persist a “booked” marker
  await supa.from("conv_threads")
    .update({ state: "booked", last_offer: in_person ? "1on1_in_person" : "1on1" })
    .eq("contact_id", contact_id)
  return { ok:true }
}

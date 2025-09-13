// backend/routes/approvals.js
import { Router } from "express"
import { supa } from "../db.js"
import { buildContext } from "../services/conversation/context.js"
import { generateMessage } from "../lib/ai_gen.js"

const r = Router()

function safeJson(x) {
  if (!x) return null
  if (typeof x === "object") return x
  try { return JSON.parse(x) } catch { return null }
}

/**
 * Ensure an approval row has a draft text.
 * Works with your approvals table shape:
 *   { id, contact_id, platform, text | message, draft_id? }
 * - Builds context from conv_* memory
 * - Generates assistant message (no templates)
 * - Saves assistant turn to conv_messages
 * - Updates approvals.text
 */
async function ensureDraftForApprovalRow(row) {
  // If there's already text, nothing to do.
  const existingText = String(row.text || row.message || "").trim()
  if (existingText) return row

  // Load contact
  const { data: contact, error: cErr } = await supa
    .from("contacts")
    .select("*")
    .eq("id", row.contact_id)
    .maybeSingle()
  if (cErr) throw cErr
  if (!contact) throw new Error("contact_not_found")

  // Build context + generate
  const ctx = await buildContext(contact, row.platform)
  const gen = await generateMessage(ctx)
  if (!gen.ok) throw new Error(gen.error || "gen_failed")

  // Find or create the thread
  let threadId = null
  const { data: th1, error: thErr } = await supa
    .from("conv_threads")
    .select("id")
    .eq("contact_id", contact.id)
    .eq("platform", row.platform)
    .limit(1)
  if (thErr) throw thErr

  if (th1 && th1.length) {
    threadId = th1[0].id
  } else {
    const { data: thNew, error: thNewErr } = await supa
      .from("conv_threads")
      .insert({
        contact_id: contact.id,
        platform: row.platform,
        state: ctx.state || "intro"
      })
      .select("id")
      .maybeSingle()
    if (thNewErr) throw thNewErr
    threadId = thNew?.id || null
  }

  // Save assistant message into conversation memory
  const { error: insErr } = await supa.from("conv_messages").insert({
    thread_id: threadId,
    role: "assistant",
    text: gen.text,
    sentiment: gen.sentiment || "neutral",
    features: gen.meta ? { gen: gen.meta } : null
  })
  if (insErr) throw insErr

  // Update approvals row with the generated draft
  const { error: updErr } = await supa
    .from("approvals")
    .update({ text: gen.text, draft_id: threadId || row.draft_id || null })
    .eq("id", row.id)
  if (updErr) throw updErr

  return { ...row, text: gen.text, draft_id: threadId || row.draft_id || null }
}

// GET /api/approvals?status=pending&limit=200&cursor=ISO
r.get("/", async (req, res) => {
  try {
    const status = (req.query.status || "pending").toString()
    const limit = Math.min(Number(req.query.limit || 200), 500)
    const cursor = req.query.cursor ? new Date(req.query.cursor) : null

    let q = supa
      .from("approvals")
      .select(
        "uid,id,platform,to_name,handle,contact_id,draft_id,text,message,created_at,status",
        { count: "exact" }
      )
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (cursor && !isNaN(cursor.getTime())) {
      q = q.lt("created_at", cursor.toISOString())
    }

    const { data, error, count } = await q
    if (error) throw error

    // Shape rows
    const baseItems = (data || []).map(x => ({
      uid: x.uid || null,
      id: x.id,
      platform: x.platform,
      to_name: x.to_name || null,
      handle: x.handle || null,
      contact_id: x.contact_id || null,
      draft_id: x.draft_id || null,
      text: x.text || x.message || "",
      created_at: x.created_at,
      status: x.status
    }))

    // Ensure drafts exist (generate only for missing)
    const items = []
    for (const row of baseItems) {
      if ((row.text || "").trim()) {
        items.push(row)
        continue
      }
      // If empty, try to generate; on failure, keep row as-is
      const fresh = await ensureDraftForApprovalRow(row).catch(() => row)
      items.push(fresh)
    }

    const nextCursor = items.length ? items[items.length - 1].created_at : null
    res.json({ ok: true, items, count, nextCursor })
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || "load_failed" })
  }
})

export default r

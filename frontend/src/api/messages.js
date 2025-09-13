import api from "./client.js"

// List drafts (returns { ok, items: [...] })
export function getDrafts(){
  return get("/api/messages/drafts")
}

// Generate drafts from latest leads (limit + platforms)
export function generateFromLatest(limit = 10, platforms = ["linkedin","instagram","facebook"]){
  return post("/api/generate/from-latest", { limit, platforms })
}

// Bulk approve: ids + startAt ISO
export function approveMessages(ids, startAt){
  return post("/api/queue/approve", { ids, startAt })
}
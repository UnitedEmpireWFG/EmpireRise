import { supabase } from "../lib/supabase.js"
import { randomUUID } from "crypto"

export function withRequestId(req, res, next) {
  req.requestId = randomUUID()
  res.setHeader("X-Request-Id", req.requestId)
  next()
}

export function logSuccess(route) {
  return async (req, _res, next) => {
    try {
      await supabase.from("logs").insert({
        request_id: req.requestId || null,
        route,
        status: "ok"
      })
    } catch {}
    next()
  }
}

export function logError(route) {
  return async (err, req, _res, next) => {
    try {
      await supabase.from("logs").insert({
        request_id: req.requestId || null,
        route,
        status: "error",
        error: err?.message || String(err)
      })
    } catch {}
    next(err)
  }
}


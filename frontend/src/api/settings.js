import api from "./client.js"

export async function getState() {
  try {
    const { data } = await client.get("/api/dispatch/state")
    return data
  } catch (e) {
    // graceful 404
    return { ok:false, error: e?.response?.data || e.message }
  }
}

export async function pauseOutbound(reason = "manual pause") {
  const { data } = await client.post("/api/dispatch/pause", { reason })
  return data
}

export async function resumeOutbound() {
  const { data } = await client.post("/api/dispatch/resume", {})
  return data
}
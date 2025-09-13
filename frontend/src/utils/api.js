export async function jfetch(url, opts = {}) {
  const res = await fetch(url, opts)
  let data = null
  try { data = await res.json() } catch { data = null }
  // Accept 2xx, or 200 with { ok:true }, or plain arrays/objects
  if (res.ok) return data
  // If server returned JSON with error, throw it
  const msg = data?.error || data?.message || `http_${res.status}`
  throw new Error(msg)
}
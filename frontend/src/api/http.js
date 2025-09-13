export const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8787"

async function doFetch(path, opts = {}) {
  const url = `${API}${path}`
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok || json?.ok === false) {
    const msg = json?.error?.message || json?.error || res.statusText || "Request failed"
    throw new Error(msg)
  }
  return json
}

export const http = {
  get: (p) => doFetch(p),
  post: (p, body) => doFetch(p, { method: "POST", body })
}
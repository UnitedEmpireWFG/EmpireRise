/* frontend/src/api/client.js */
const BASE = "http://127.0.0.1:8787";

async function api(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: false, error: text || "Non-JSON response" }; }
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

async function getJSON(path) {
  return api(path, { method: "GET" });
}

async function postJSON(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body || {}) });
}

export default api;          // default import
export { api, getJSON, postJSON };   // named import compatibility
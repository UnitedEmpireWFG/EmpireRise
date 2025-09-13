// frontend/src/lib/apiFetch.js
import { supa } from './supa'

// Netlify -> set VITE_API_BASE to your Render backend root, e.g. https://empirerise.onrender.com
const API_BASE = import.meta.env.VITE_API_BASE?.replace(/\/+$/, '') || ''

// Simple in-memory token cache to avoid calling supa on every request
let cached = { token: null, at: 0 }
async function getToken() {
  const now = Date.now()
  if (cached.token && now - cached.at < 50_000) return cached.token // refresh every ~50s
  const { data } = await supa.auth.getSession()
  const t = data?.session?.access_token || null
  cached = { token: t, at: now }
  return t
}

/**
 * apiFetch(path, opts) – automatically prefixes API base and attaches Bearer token
 * Throws for network errors; returns parsed JSON
 */
export async function apiFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const token = await getToken()

  const headers = new Headers(opts.headers || {})
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(url, { ...opts, headers, credentials: 'include' })
  // Optional: quick debug if needed
  // console.debug('apiFetch', { url, status: res.status })

  // normalize JSON
  let body = null
  const text = await res.text()
  try { body = text ? JSON.parse(text) : null } catch { body = { ok:false, error:'bad_json', raw:text } }

  if (!res.ok) {
    // bubble up 401 for the AuthBanner to show
    const err = new Error(body?.error || `http_${res.status}`)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

// Convenience helpers
export const get = (p) => apiFetch(p, { method: 'GET' })
export const post = (p, json) => apiFetch(p, { method: 'POST', body: JSON.stringify(json || {}) })
export const put = (p, json) => apiFetch(p, { method: 'PUT', body: JSON.stringify(json || {}) })
export const del = (p) => apiFetch(p, { method: 'DELETE' })
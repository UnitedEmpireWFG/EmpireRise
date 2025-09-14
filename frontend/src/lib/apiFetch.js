import { supa } from './supa'

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8787').replace(/\/+$/, '')

async function authHeader() {
  const { data } = await supa.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const hdr = await authHeader()
  const res = await fetch(url, {
    credentials: 'include',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), ...hdr }
  })
  if (res.status === 401 || res.status === 403) {
    const t = await res.text().catch(() => '')
    throw new Error('unauthorized' + (t ? `: ${t}` : ''))
  }
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}
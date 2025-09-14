// frontend/src/lib/apiFetch.js
import { createClient } from '@supabase/supabase-js'

export const supa = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,           // keep session across reloads
      autoRefreshToken: true
    }
  }
)

// Base URL for backend API (Render, local, etc.)
const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/+$/, '') || 'http://localhost:8787'

async function authHeader() {
  // Always fetch the latest session (works after login refresh)
  const { data } = await supa.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * apiFetch(path, options)
 * Usage: apiFetch('/api/queue?limit=50')
 */
export async function apiFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const hdr = await authHeader()
  const res = await fetch(url, {
    credentials: 'include',
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...hdr
    }
  })
  // Normalize 401 into a readable error
  if (res.status === 401 || res.status === 403) {
    const t = await res.text().catch(() => '')
    throw new Error('unauthorized' + (t ? `: ${t}` : ''))
  }
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}
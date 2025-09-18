import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supa = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

// Start background refresh
supa.auth.onAuthStateChange((_event, _session) => {})

export async function requireToken() {
  // Try current session
  let { data: { session } } = await supa.auth.getSession()
  if (session?.access_token) return session.access_token

  // Try to recover silently
  await supa.auth.refreshSession()
  ;({ data: { session } } = await supa.auth.getSession())
  if (session?.access_token) return session.access_token

  // No session. Redirect to login.
  const here = window.location.href
  const login = '/login?next=' + encodeURIComponent(here)
  window.location.assign(login)
  throw new Error('redirect_login')
}
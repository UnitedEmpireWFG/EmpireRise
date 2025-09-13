import { createClient } from '@supabase/supabase-js'

if (!window.__supa) {
  window.__supa = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'er-auth',
      },
    }
  )
}
export const supa = window.__supa
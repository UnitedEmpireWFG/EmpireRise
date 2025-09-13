/* backend/db.js */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anon) {
  throw new Error('supabase_env_missing: SUPABASE_URL and SUPABASE_ANON_KEY must be set')
}

export const supa = createClient(url, anon, {
  auth: { persistSession: false }
})

export const supaAdmin = service
  ? createClient(url, service, { auth: { persistSession: false } })
<<<<<<< HEAD
  : null // optional; some hosts won’t use service key
=======
  : null // optional; some hosts won’t use service key
>>>>>>> bf5cadf (Update frontend (Navbar, apiFetch, App))
